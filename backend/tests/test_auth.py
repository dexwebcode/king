import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from backend.auth.routers.telegram import telegram_guest_status, telegram_start
from backend.auth.routers.vkid import vk_login
from backend.auth.schemas import RegisterRequest, TelegramStartRequest, VkLoginRequest
from backend.auth.security import (
    hash_md5_password,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from backend.auth.service import UserAlreadyExistsError, login_user, register_user
from backend.auth.social_auth import authenticate_social_user
from backend.auth.telegram_notifier import send_registration_welcome


class PasswordSecurityTests(unittest.TestCase):
    def test_new_hash_is_salted_pbkdf2(self):
        first = hash_password("SecurePass1")
        second = hash_password("SecurePass1")
        self.assertNotEqual(first, second)
        self.assertTrue(verify_password("SecurePass1", first))
        self.assertFalse(verify_password("wrong", first))
        self.assertFalse(password_needs_rehash(first))

    def test_legacy_md5_rejected_when_window_closed(self):
        legacy = hash_md5_password("LegacyPass1")
        self.assertFalse(verify_password("LegacyPass1", legacy))
        self.assertTrue(password_needs_rehash(legacy))

    @patch("backend.auth.security.ALLOW_LEGACY_MD5_LOGIN", True)
    def test_legacy_md5_accepted_when_window_open(self):
        legacy = hash_md5_password("LegacyPass1")
        self.assertTrue(verify_password("LegacyPass1", legacy))
        self.assertTrue(password_needs_rehash(legacy))

    def test_local_registration_requires_real_login_email_and_password(self):
        request = RegisterRequest(
            login="local-user",
            email="local@example.com",
            password="SecurePass1",
        )
        self.assertEqual(request.login, "local-user")
        self.assertEqual(str(request.email), "local@example.com")


class LocalAuthenticationTests(unittest.TestCase):
    @patch("backend.auth.security.ALLOW_LEGACY_MD5_LOGIN", True)
    @patch("backend.auth.service.create_access_token", return_value="jwt")
    @patch("backend.auth.service.update_user_password")
    @patch("backend.auth.service.get_user_by_login_or_email")
    @patch("backend.auth.service.SessionLocal")
    def test_local_login_accepts_legacy_password_and_upgrades_hash(
        self, session_local, get_user, update_password, _jwt
    ):
        session = session_local.return_value
        get_user.return_value = {
            "id": 7,
            "login": "legacy",
            "mail": "legacy@example.com",
            "password": hash_md5_password("LegacyPass1"),
        }

        result = login_user("legacy", "LegacyPass1")

        self.assertEqual(result["token"], "jwt")
        update_password.assert_called_once()
        session.commit.assert_called_once()

    @patch("backend.auth.service.create_access_token", return_value="jwt")
    @patch("backend.auth.service.get_user_by_login_or_email")
    @patch("backend.auth.service.SessionLocal")
    def test_local_login_supports_email_and_rejects_wrong_password(
        self, session_local, get_user, _jwt
    ):
        get_user.return_value = {
            "id": 7,
            "login": "local",
            "mail": "local@example.com",
            "password": hash_password("SecurePass1"),
        }

        success = login_user("local@example.com", "SecurePass1")
        failure = login_user("local@example.com", "wrong")

        self.assertEqual(success["token"], "jwt")
        self.assertIsNone(failure)
        self.assertEqual(get_user.call_args_list[0].kwargs["login_or_email"], "local@example.com")
        self.assertEqual(session_local.call_count, 2)

    @patch("backend.auth.service.create_access_token", return_value="jwt")
    @patch("backend.auth.service.create_user")
    @patch("backend.auth.service.get_user_by_email", return_value=None)
    @patch("backend.auth.service.get_user_by_login", return_value=None)
    @patch("backend.auth.service.SessionLocal")
    def test_local_registration_stores_real_credentials(
        self, session_local, _login, _email, create_user, _jwt
    ):
        session = session_local.return_value
        create_user.return_value = {
            "id": 8,
            "login": "new-user",
            "mail": "new@example.com",
        }

        result = register_user("new-user", "new@example.com", "SecurePass1")

        self.assertEqual(result["login"], "new-user")
        kwargs = create_user.call_args.kwargs
        self.assertEqual(kwargs["login"], "new-user")
        self.assertEqual(kwargs["email"], "new@example.com")
        self.assertTrue(kwargs["password"].startswith("pbkdf2_sha256$"))
        session.commit.assert_called_once()

    @patch("backend.auth.service.create_user")
    @patch("backend.auth.service.get_user_by_email", return_value=None)
    @patch("backend.auth.service.get_user_by_login")
    @patch("backend.auth.service.SessionLocal")
    def test_local_registration_rejects_taken_login(
        self, _session, get_login, _get_email, create_user
    ):
        get_login.return_value = {"id": 1}
        with self.assertRaises(UserAlreadyExistsError):
            register_user("taken", "free@example.com", "SecurePass1")
        create_user.assert_not_called()

    @patch("backend.auth.service.create_user")
    @patch("backend.auth.service.get_user_by_email")
    @patch("backend.auth.service.get_user_by_login", return_value=None)
    @patch("backend.auth.service.SessionLocal")
    def test_local_registration_rejects_taken_email(
        self, _session, _get_login, get_email, create_user
    ):
        get_email.return_value = {"id": 1}
        with self.assertRaises(UserAlreadyExistsError):
            register_user("free", "taken@example.com", "SecurePass1")
        create_user.assert_not_called()


class SocialAuthenticationTests(unittest.TestCase):
    @patch("backend.auth.social_auth.create_user_social_account")
    @patch("backend.auth.social_auth.create_user")
    @patch("backend.auth.social_auth.get_user_by_id")
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id")
    def test_new_social_user_has_no_local_credentials(
        self, get_account, _get_user, create_user, upsert
    ):
        session = MagicMock()
        get_account.return_value = None
        create_user.return_value = {"id": 42, "login": None, "mail": None}

        user, created = authenticate_social_user(
            session,
            provider="telegram",
            provider_user_id="9001",
            username="tester",
        )

        self.assertTrue(created)
        self.assertEqual(user["id"], 42)
        create_user.assert_called_once_with(
            session, login=None, email=None, password=None
        )
        upsert.assert_called_once_with(
            session, 42, "telegram", "9001", "tester", None, None
        )
        session.commit.assert_called_once()

    @patch("backend.auth.social_auth.get_user_by_id")
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id")
    @patch("backend.auth.social_auth.create_user_social_account")
    @patch("backend.auth.social_auth.create_user")
    def test_unique_race_reuses_winning_social_account(
        self, create_user, upsert, get_account, get_user
    ):
        session = MagicMock()
        create_user.return_value = {"id": 42, "login": None, "mail": None}
        upsert.side_effect = IntegrityError("insert", {}, Exception("unique"))
        get_account.side_effect = [None, {"user_id": 84}]
        get_user.return_value = {"id": 84, "login": None, "mail": None}

        user, created = authenticate_social_user(
            session, provider="vk", provider_user_id="123"
        )

        self.assertFalse(created)
        self.assertEqual(user["id"], 84)
        session.rollback.assert_called_once()

    @patch("backend.auth.social_auth.update_user_social_account_profile")
    @patch("backend.auth.social_auth.create_user")
    @patch("backend.auth.social_auth.get_user_by_id")
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id")
    def test_changed_social_profile_reuses_permanent_provider_id(
        self, get_account, get_user, create_user, update_profile
    ):
        session = MagicMock()
        get_account.return_value = {"user_id": 42}
        get_user.return_value = {"id": 42, "login": None, "mail": None}

        user, created = authenticate_social_user(
            session,
            provider="telegram",
            provider_user_id="9001",
            username="new_username",
            display_name="New Name",
        )

        self.assertFalse(created)
        self.assertEqual(user["id"], 42)
        create_user.assert_not_called()
        update_profile.assert_called_once()


class TelegramAuthenticationTests(unittest.TestCase):
    @patch("backend.auth.routers.telegram.send_registration_welcome")
    @patch("backend.auth.routers.telegram.finish_telegram_guest_session_redemption", return_value=True)
    @patch("backend.auth.routers.telegram.create_access_token", return_value="jwt")
    @patch("backend.auth.routers.telegram.authenticate_social_user")
    @patch("backend.auth.routers.telegram.claim_authorized_telegram_guest_session")
    def test_first_telegram_login_creates_and_welcomes_once(
        self, claim_auth_session, authenticate, _token, finish_redemption, welcome
    ):
        claim_auth_session.return_value = {
            "id": 7,
            "status": "redeeming",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
            "telegram_id": 9001,
            "telegram_username": "tester",
            "telegram_display_name": "Test User",
        }
        authenticate.return_value = ({"id": 42, "login": None, "mail": None}, True)

        background_tasks = MagicMock()
        response = telegram_guest_status("opaque", background_tasks, MagicMock())

        self.assertEqual(response["action"], "login")
        self.assertEqual(response["token"], "jwt")
        finish_redemption.assert_called_once_with(unittest.mock.ANY, 7)
        background_tasks.add_task.assert_called_once_with(welcome, 9001)

    @patch("backend.auth.routers.telegram.send_registration_welcome")
    @patch("backend.auth.routers.telegram.finish_telegram_guest_session_redemption", return_value=True)
    @patch("backend.auth.routers.telegram.create_access_token", return_value="jwt")
    @patch("backend.auth.routers.telegram.authenticate_social_user")
    @patch("backend.auth.routers.telegram.claim_authorized_telegram_guest_session")
    def test_subsequent_telegram_login_does_not_send_welcome(
        self, claim_auth_session, authenticate, _token, _finish_redemption, welcome
    ):
        claim_auth_session.return_value = {
            "id": 7,
            "status": "redeeming",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
            "telegram_id": 9001,
            "telegram_username": "tester",
            "telegram_display_name": "Test User",
        }
        authenticate.return_value = ({"id": 42, "login": None, "mail": None}, False)
        background_tasks = MagicMock()

        response = telegram_guest_status("opaque", background_tasks, MagicMock())

        self.assertEqual(response["token"], "jwt")
        background_tasks.add_task.assert_not_called()
        welcome.assert_not_called()

    @patch("backend.auth.routers.telegram.create_access_token")
    @patch("backend.auth.routers.telegram.get_telegram_auth_session")
    @patch("backend.auth.routers.telegram.claim_authorized_telegram_guest_session", return_value=None)
    def test_consumed_telegram_session_cannot_issue_another_jwt(
        self, _claim, get_auth_session, create_token
    ):
        get_auth_session.return_value = {
            "status": "consumed",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        }

        response = telegram_guest_status("opaque", MagicMock(), MagicMock())

        self.assertFalse(response["authorized"])
        self.assertEqual(response["status"], "consumed")
        create_token.assert_not_called()

    @patch("backend.auth.routers.telegram.authenticate_social_user")
    @patch("backend.auth.routers.telegram.get_telegram_auth_session")
    @patch("backend.auth.routers.telegram.claim_authorized_telegram_guest_session", return_value=None)
    def test_concurrent_telegram_redemption_waits_without_issuing_jwt(
        self, _claim, get_auth_session, authenticate
    ):
        get_auth_session.return_value = {
            "status": "redeeming",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        }

        response = telegram_guest_status("opaque", MagicMock(), MagicMock())

        self.assertFalse(response["authorized"])
        self.assertEqual(response["status"], "processing")
        authenticate.assert_not_called()

    @patch("backend.auth.routers.telegram.create_access_token")
    @patch("backend.auth.routers.telegram.get_telegram_auth_session")
    @patch("backend.auth.routers.telegram.claim_authorized_telegram_guest_session", return_value=None)
    def test_expired_authorized_telegram_session_cannot_issue_jwt(
        self, _claim, get_auth_session, create_token
    ):
        get_auth_session.return_value = {
            "status": "authorized",
            "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
        }

        response = telegram_guest_status("opaque", MagicMock(), MagicMock())

        self.assertFalse(response["authorized"])
        self.assertEqual(response["status"], "expired")
        create_token.assert_not_called()

    def test_fake_bot_cannot_submit_telegram_id(self):
        with self.assertRaises(HTTPException) as raised:
            telegram_start(
                TelegramStartRequest(token="opaque", telegram_id=9001),
                x_telegram_bot_secret="wrong-secret",
                session=MagicMock(),
            )
        self.assertEqual(raised.exception.status_code, 401)

    @patch("backend.auth.telegram_notifier.TELEGRAM_BOT_TOKEN", "bot-token")
    @patch("backend.auth.telegram_notifier.urlopen", side_effect=TimeoutError)
    def test_welcome_failure_is_non_fatal(self, _urlopen):
        send_registration_welcome(9001)


class VkAuthenticationTests(unittest.TestCase):
    def test_empty_vk_access_token_is_rejected(self):
        with self.assertRaises(ValidationError):
            VkLoginRequest(access_token=" ")

    @patch("backend.auth.routers.vkid.create_access_token", return_value="jwt")
    @patch("backend.auth.routers.vkid.authenticate_social_user")
    @patch("backend.auth.routers.vkid.fetch_vk_user_info")
    def test_first_and_subsequent_vk_login_use_same_passwordless_path(
        self, user_info, authenticate, _jwt
    ):
        user_info.return_value = {
            "user_id": "7001",
            "first_name": "VK",
            "last_name": "User",
        }
        request = VkLoginRequest(access_token="provider-token")

        authenticate.return_value = ({"id": 51, "login": None, "mail": None}, True)
        first = vk_login(request, MagicMock())
        authenticate.return_value = ({"id": 51, "login": None, "mail": None}, False)
        second = vk_login(request, MagicMock())

        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(first["user"]["id"], second["user"]["id"])
        user_info.assert_called_with("provider-token")


if __name__ == "__main__":
    unittest.main()
