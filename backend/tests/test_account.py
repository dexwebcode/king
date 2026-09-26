"""Тесты единой системы способов входа.

Юнит-тесты (без БД): схемы, AccountService, connect_social_user.
Интеграционные (ACCOUNT_TEST_DATABASE_URL на *_test БД): migration-backfill и REST API.
"""

import json
import os
import socket
import threading
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from unittest.mock import patch

from pydantic import ValidationError

from backend.auth.security import create_access_token, hash_password
from backend.auth.social_auth import (
    SocialAccountAlreadyLinkedError,
    connect_social_user,
)
from backend.account.schemas import AddEmailRequest, SetCredentialsRequest
from backend.account.service import (
    AccountService,
    CurrentPasswordError,
    EmailAlreadyUsedError,
    LastLoginMethodError,
    LoginAlreadyUsedError,
    PasswordRequiredError,
)


class _NullContext:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeSession:
    def __init__(self):
        self.committed = 0
        self.rolled_back = 0

    def begin(self):
        return _NullContext()

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolled_back += 1

    def close(self):
        pass


# --------------------------------------------------------------------------- #
class AccountSchemaTests(unittest.TestCase):
    def test_add_email_normalizes(self):
        self.assertEqual(str(AddEmailRequest(email="  User@Example.com ").email), "user@example.com")

    def test_add_email_rejects_invalid(self):
        for value in ["", "   ", "not-an-email", "@", "a b@c.com"]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AddEmailRequest(email=value)

    def test_set_credentials_normalizes_login(self):
        data = SetCredentialsRequest(login="  New_Login ", password="StrongPass1")
        self.assertEqual(data.login, "new_login")
        self.assertIsNone(SetCredentialsRequest(login="oklogin", password="").password)

    def test_set_credentials_rejects_invalid(self):
        invalid = [
            {"login": "ab", "password": "StrongPass1"},
            {"login": "x" * 41, "password": "StrongPass1"},
            {"login": "has space", "password": "StrongPass1"},
            {"login": "oklogin", "password": "weak"},
            {"login": "oklogin", "password": "nouppercase1"},
            {"login": "oklogin", "password": "StrongPass1", "user_id": 5},
        ]
        for payload in invalid:
            with self.subTest(payload=str(payload)), self.assertRaises(ValidationError):
                SetCredentialsRequest(**payload)


# --------------------------------------------------------------------------- #
class AccountServiceTests(unittest.TestCase):
    def _account(self, **overrides):
        base = {
            "id": 1,
            "login": "ava",
            "mail": None,
            "email_verified": False,
            "has_password": False,
        }
        base.update(overrides)
        return base

    @patch("backend.account.service.get_user_social_accounts")
    @patch("backend.account.service.repository.get_user_account")
    @patch("backend.account.service.SessionLocal")
    def test_get_account_shape(self, session_local, get_user_account, get_socials):
        session_local.return_value = _FakeSession()
        get_user_account.return_value = self._account(has_password=True, mail="a@b.c", email_verified=True)
        get_socials.return_value = [{"provider": "telegram", "username": "ava", "display_name": None}]

        result = AccountService.get_account(1)

        self.assertTrue(result["has_password"])
        self.assertTrue(result["email_verified"])
        self.assertTrue(result["connections"]["telegram"]["connected"])
        self.assertEqual(result["connections"]["telegram"]["username"], "ava")
        self.assertFalse(result["connections"]["vk"]["connected"])

    @patch("backend.account.service.repository.set_user_email")
    @patch("backend.account.service.repository.find_user_by_email", return_value={"id": 99})
    @patch("backend.account.service.repository.get_user_account", return_value={"mail": None})
    @patch("backend.account.service.SessionLocal")
    def test_add_email_conflict_does_not_write(self, session_local, _get_user, _find, set_email):
        session_local.return_value = _FakeSession()
        with self.assertRaises(EmailAlreadyUsedError):
            AccountService.add_email(1, "taken@example.com")
        set_email.assert_not_called()

    @patch("backend.account.service.repository.set_user_email", return_value={"mail": "new@example.com", "email_verified": False})
    @patch("backend.account.service.repository.find_user_by_email", return_value=None)
    @patch("backend.account.service.repository.get_user_account", return_value={"mail": None})
    @patch("backend.account.service.SessionLocal")
    def test_add_email_sets_unverified(self, session_local, _get_user, _find, _set):
        session_local.return_value = _FakeSession()
        result = AccountService.add_email(1, "new@example.com")
        self.assertEqual(result["email"], "new@example.com")
        self.assertFalse(result["email_verified"])

    @patch("backend.account.service.delete_user_social_account")
    @patch("backend.account.service.get_user_social_accounts")
    @patch("backend.account.service.repository.get_user_account")
    @patch("backend.account.service.SessionLocal")
    def test_disconnect_last_method_is_blocked(self, session_local, get_user_account, get_socials, delete):
        session_local.return_value = _FakeSession()
        get_user_account.return_value = self._account(has_password=False)
        get_socials.return_value = [{"provider": "telegram", "username": "ava", "display_name": None}]

        with self.assertRaises(LastLoginMethodError):
            AccountService.disconnect_provider(1, "telegram")
        delete.assert_not_called()

    @patch("backend.account.service.delete_user_social_account")
    @patch("backend.account.service.get_user_social_accounts")
    @patch("backend.account.service.repository.get_user_account")
    @patch("backend.account.service.SessionLocal")
    def test_disconnect_allowed_with_password_fallback(self, session_local, get_user_account, get_socials, delete):
        session_local.return_value = _FakeSession()
        get_user_account.return_value = self._account(has_password=True)
        get_socials.return_value = [{"provider": "telegram", "username": "ava", "display_name": None}]

        result = AccountService.disconnect_provider(1, "telegram")
        self.assertTrue(result["success"])
        delete.assert_called_once_with(session_local.return_value, 1, "telegram")


# --------------------------------------------------------------------------- #
class SetCredentialsTests(unittest.TestCase):
    @patch("backend.account.service.increment_user_token_version")
    @patch("backend.account.service.repository.update_user_credentials")
    @patch("backend.account.service.repository.find_user_by_login", return_value=None)
    @patch("backend.account.service.repository.get_user_for_credentials")
    @patch("backend.account.service.SessionLocal")
    def test_social_user_sets_login_and_password(self, session_local, get_creds, _find, update, bump_version):
        session_local.return_value = _FakeSession()
        get_creds.return_value = {"id": 1, "login": None, "password": None}
        update.return_value = {"id": 1, "login": "newlogin"}

        result = AccountService.set_credentials(1, login="newlogin", password="StrongPass1")

        self.assertTrue(result["has_password"])
        self.assertEqual(result["login"], "newlogin")
        self.assertTrue(update.call_args.args[3].startswith("pbkdf2_sha256$"))
        bump_version.assert_called_once_with(session_local.return_value, 1)

    @patch("backend.account.service.repository.update_user_credentials")
    @patch("backend.account.service.repository.find_user_by_login", return_value={"id": 99})
    @patch("backend.account.service.repository.get_user_for_credentials")
    @patch("backend.account.service.SessionLocal")
    def test_login_conflict_rejected(self, session_local, get_creds, _find, update):
        session_local.return_value = _FakeSession()
        get_creds.return_value = {"id": 1, "login": None, "password": None}

        with self.assertRaises(LoginAlreadyUsedError):
            AccountService.set_credentials(1, login="taken", password="StrongPass1")
        update.assert_not_called()

    @patch("backend.account.service.increment_user_token_version")
    @patch("backend.account.service.repository.find_user_by_login", return_value=None)
    @patch("backend.account.service.repository.update_user_credentials")
    @patch("backend.account.service.repository.get_user_for_credentials")
    @patch("backend.account.service.SessionLocal")
    def test_password_change_requires_and_verifies_current(self, session_local, get_creds, update, _find, bump_version):
        session_local.return_value = _FakeSession()
        get_creds.return_value = {"id": 1, "login": "ava", "password": hash_password("OldPass1")}

        with self.assertRaises(CurrentPasswordError):
            AccountService.set_credentials(1, login="ava", password="NewPass1")
        with self.assertRaises(CurrentPasswordError):
            AccountService.set_credentials(1, login="ava", password="NewPass1", current_password="wrong")
        update.assert_not_called()
        bump_version.assert_not_called()

        update.return_value = {"id": 1, "login": "ava"}
        result = AccountService.set_credentials(
            1, login="ava", password="NewPass1", current_password="OldPass1"
        )
        self.assertTrue(result["has_password"])
        update.assert_called_once()
        bump_version.assert_called_once_with(session_local.return_value, 1)

    @patch("backend.account.service.repository.update_user_credentials")
    @patch("backend.account.service.repository.find_user_by_login", return_value=None)
    @patch("backend.account.service.repository.get_user_for_credentials")
    @patch("backend.account.service.SessionLocal")
    def test_login_only_change_keeps_password(self, session_local, get_creds, _find, update):
        session_local.return_value = _FakeSession()
        get_creds.return_value = {"id": 1, "login": "old", "password": hash_password("OldPass1")}
        update.return_value = {"id": 1, "login": "newlogin"}

        AccountService.set_credentials(1, login="newlogin")

        self.assertIsNone(update.call_args.args[3])

    @patch("backend.account.service.repository.update_user_credentials")
    @patch("backend.account.service.repository.get_user_for_credentials")
    @patch("backend.account.service.SessionLocal")
    def test_login_without_password_for_social_user_rejected(self, session_local, get_creds, update):
        session_local.return_value = _FakeSession()
        get_creds.return_value = {"id": 1, "login": None, "password": None}

        with self.assertRaises(PasswordRequiredError):
            AccountService.set_credentials(1, login="newlogin")
        update.assert_not_called()


# --------------------------------------------------------------------------- #
class ConnectSocialUserTests(unittest.TestCase):
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id", return_value={"user_id": 99})
    def test_connect_conflict_when_linked_to_other_user(self, _get):
        session = _FakeSession()
        with self.assertRaises(SocialAccountAlreadyLinkedError):
            connect_social_user(session, user_id=1, provider="telegram", provider_user_id="123")

    @patch("backend.auth.social_auth.update_user_social_account_profile")
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id", return_value={"user_id": 1})
    def test_connect_idempotent_when_already_linked(self, _get, update):
        session = _FakeSession()
        connect_social_user(session, user_id=1, provider="telegram", provider_user_id="123")
        update.assert_called_once()

    @patch("backend.auth.social_auth.create_user_social_account")
    @patch("backend.auth.social_auth.get_user_social_account_by_user_and_provider", return_value=None)
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id", return_value=None)
    def test_connect_creates_link(self, _get_puid, _get_user, create):
        session = _FakeSession()
        connect_social_user(session, user_id=1, provider="vk", provider_user_id="321", display_name="Иван")
        create.assert_called_once()

    @patch("backend.auth.social_auth.get_user_social_account_by_user_and_provider", return_value={"user_id": 1, "provider": "vk"})
    @patch("backend.auth.social_auth.get_user_social_account_by_provider_user_id", return_value=None)
    def test_connect_rejects_second_provider_for_same_user(self, _get_puid, _get_user):
        session = _FakeSession()
        with self.assertRaises(SocialAccountAlreadyLinkedError):
            connect_social_user(session, user_id=1, provider="vk", provider_user_id="999")


# --------------------------------------------------------------------------- #
@unittest.skipUnless(os.getenv("ACCOUNT_TEST_DATABASE_URL"), "Requires ACCOUNT_TEST_DATABASE_URL on a *_test DB")
class AccountApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        from sqlalchemy.orm import sessionmaker
        import uvicorn
        from fastapi import FastAPI

        url = os.environ["ACCOUNT_TEST_DATABASE_URL"]
        if not (make_url(url).database or "").endswith("_test"):
            raise RuntimeError("Refusing to modify a database whose name does not end in _test")
        cls.engine = create_engine(url)
        cls.sessions = sessionmaker(bind=cls.engine)
        with cls.engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS migration_temp"))
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS public"))
            connection.execute(
                text(
                    """CREATE TABLE IF NOT EXISTS migration_temp.users (
                        id BIGSERIAL PRIMARY KEY, login TEXT, mail TEXT, password TEXT, balance NUMERIC DEFAULT 0
                    )"""
                )
            )
            connection.execute(
                text(
                    """CREATE TABLE IF NOT EXISTS public.user_social_accounts (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT REFERENCES migration_temp.users(id) ON DELETE CASCADE,
                        provider TEXT, provider_user_id TEXT, username TEXT, display_name TEXT, avatar_url TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT uq_social_puid UNIQUE (provider, provider_user_id),
                        CONSTRAINT uq_social_user_provider UNIQUE (user_id, provider)
                    )"""
                )
            )
            connection.execute(
                text(
                    """CREATE TABLE IF NOT EXISTS public.telegram_auth_sessions (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT,
                        token_hash CHAR(64) NOT NULL UNIQUE,
                        telegram_id BIGINT,
                        telegram_username TEXT,
                        telegram_display_name TEXT,
                        status VARCHAR(32) NOT NULL DEFAULT 'pending',
                        expires_at TIMESTAMPTZ NOT NULL,
                        used_at TIMESTAMPTZ,
                        consumed_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )"""
                )
            )

        # Проверяем backfill миграции: пользователь с Email ДО миграции → verified = true.
        with cls.engine.begin() as connection:
            connection.execute(
                text("INSERT INTO migration_temp.users(login, mail, password) VALUES ('old','old@example.com','x')")
            )
        raw = cls.engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                cursor.execute((Path(__file__).parents[1] / "migrations/007_account_connections.sql").read_text())
            raw.commit()
        finally:
            raw.close()
        with cls.engine.connect() as connection:
            verified = connection.execute(
                text("SELECT email_verified FROM migration_temp.users WHERE login = 'old'")
            ).scalar_one()
        cls.assertTrue(verified)

        from backend.account.router import router as account_router
        from backend.auth.routers.vkid import router as vkid_router
        from backend.auth.routers.telegram import router as telegram_router
        from backend.core.database import get_db

        app = FastAPI()
        app.include_router(account_router)
        app.include_router(vkid_router)
        app.include_router(telegram_router)

        def test_db():
            with cls.sessions() as session:
                yield session

        app.dependency_overrides[get_db] = test_db

        cls.sock = socket.socket()
        cls.sock.bind(("127.0.0.1", 0))
        cls.base = f"http://127.0.0.1:{cls.sock.getsockname()[1]}"
        cls.server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        cls.thread = threading.Thread(target=cls.server.run, kwargs={"sockets": [cls.sock]}, daemon=True)
        cls.thread.start()
        for _ in range(100):
            if cls.server.started:
                break
            time.sleep(0.02)
        else:
            raise RuntimeError("Test API did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        cls.sock.close()
        cls.engine.dispose()

    def setUp(self):
        from sqlalchemy import text

        with self.engine.begin() as connection:
            connection.execute(text("TRUNCATE public.user_social_accounts, public.telegram_auth_sessions, migration_temp.users RESTART IDENTITY CASCADE"))
            connection.execute(
                text(
                    "INSERT INTO migration_temp.users(id, login, mail, password) VALUES "
                    "(1, 'user-a', NULL, 'hashed-password'), (2, 'user-b', NULL, NULL)"
                )
            )

    def request(self, path="", method="GET", body=None, user=None, token=None):
        headers = {"Content-Type": "application/json"}
        if user:
            token = create_access_token(user)
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(self.base + path, method=method, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_account_shape_and_email_flow(self):
        status, data = self.request("/api/account", user=1)
        self.assertEqual(status, 200)
        self.assertTrue(data["has_password"])
        self.assertFalse(data["connections"]["telegram"]["connected"])
        self.assertFalse(data["connections"]["vk"]["connected"])

        status, result = self.request("/api/account/email", "POST", {"email": "new@example.com"}, user=1)
        self.assertEqual(status, 201)
        self.assertFalse(result["email_verified"])

        # Тот же email уже занят другим пользователем.
        self.assertEqual(self.request("/api/account/email", "POST", {"email": "new@example.com"}, user=2)[0], 409)

    def test_disconnect_not_connected_and_last_method(self):
        self.assertEqual(self.request("/api/account/connections/telegram", "DELETE", user=1)[0], 404)
        # user-b: нет пароля, нет подключений → отключение vk даст «не подключено».
        self.assertEqual(self.request("/api/account/connections/vk", "DELETE", user=2)[0], 404)

    def test_credentials_flow(self):
        # user-a уже имеет пароль → смена без текущего пароля запрещена.
        self.assertEqual(
            self.request("/api/account/credentials", "POST", {"login": "user-a", "password": "StrongPass1"}, user=1)[0],
            400,
        )
        # user-b (соц-аккаунт без пароля) задаёт логин и пароль.
        status, result = self.request(
            "/api/account/credentials", "POST", {"login": "brandnew", "password": "StrongPass1"}, user=2
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["login"], "brandnew")
        self.assertTrue(result["has_password"])
        # Логин занят другим аккаунтом.
        self.assertEqual(
            self.request("/api/account/credentials", "POST", {"login": "user-a", "password": "StrongPass1"}, user=2)[0],
            409,
        )


if __name__ == "__main__":
    unittest.main()
