"""Тесты модуля поддержки.

- Юнит-тесты (запускаются без БД): схемы, статусы, service-логика, уведомления,
  безопасность Telegram-бота.
- Интеграционные тесты (SUPPORT_TEST_DATABASE_URL на *_test БД): полный поток
  пользователь/админ через HTTP.
"""

import json
import os
import socket
import threading
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from unittest.mock import MagicMock, patch

from pydantic import ValidationError

from backend.auth.security import create_access_token
from backend.core.database import get_db
from backend.support import notifications, repository, schemas
from backend.support.constants import (
    ADMIN_STATUS_LABELS,
    SupportSenderType,
    SupportTicketStatus,
    status_label,
)
from backend.support.schemas import (
    CreateTicketRequest,
    SendMessageRequest,
    StatusUpdateRequest,
)
from backend.support.service import (
    SupportService,
    TicketClosedError,
    TicketNotFoundError,
)


class _NullContext:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeSession:
    def __init__(self):
        self.committed = False

    def begin(self):
        return _NullContext()

    def close(self):
        pass


# --------------------------------------------------------------------------- #
# Валидация входящих данных
# --------------------------------------------------------------------------- #
class SupportValidationTests(unittest.TestCase):
    def test_create_ticket_valid_payload_and_trimming(self):
        data = CreateTicketRequest(
            message="   Не изменяется статус моего заказа.  ",
            contact="  https://t.me/username ",
        )
        self.assertEqual(data.message, "Не изменяется статус моего заказа.")
        self.assertEqual(data.contact, "https://t.me/username")
        self.assertIsNone(data.subject)

    def test_create_ticket_rejects_invalid(self):
        invalid = [
            {"message": "short", "contact": "https://t.me/u"},
            {"message": "x" * 5001, "contact": "https://t.me/u"},
            {"message": "Достаточно длинное сообщение", "contact": ""},
            {"message": "Достаточно длинное сообщение", "contact": "a" * 256},
            {"message": "Достаточно длинное сообщение", "contact": "<script>alert(1)</script>"},
            {"message": "Достаточно длинное сообщение", "contact": "javascript:alert(1)"},
            {"message": "Достаточно длинное сообщение", "contact": "t.me/u", "user_id": 5},
        ]
        for payload in invalid:
            with self.subTest(payload=str(payload)[:60]), self.assertRaises(ValidationError):
                CreateTicketRequest(**payload)

    def test_send_message_rejects_empty_and_too_long(self):
        for value in ["", "   ", "x" * 5001]:
            with self.subTest(value=value[:20]), self.assertRaises(ValidationError):
                SendMessageRequest(message=value)

    def test_status_update_rejects_unknown(self):
        with self.assertRaises(ValidationError):
            StatusUpdateRequest(status="bogus")
        self.assertEqual(StatusUpdateRequest(status=" IN_PROGRESS ").status, "in_progress")


# --------------------------------------------------------------------------- #
# Статусы
# --------------------------------------------------------------------------- #
class SupportStatusTests(unittest.TestCase):
    def test_labels_match_spec(self):
        self.assertEqual(status_label("new"), "Новая")
        self.assertEqual(status_label("in_progress"), "В работе")
        self.assertEqual(status_label("answered"), "Есть ответ")
        self.assertEqual(status_label("waiting_user"), "Ожидает вашего ответа")
        self.assertEqual(status_label("waiting_user", for_admin=True), "Ожидает ответа")
        self.assertEqual(status_label("closed"), "Закрыта")

    def test_admin_labels_cover_all_statuses(self):
        for status in SupportTicketStatus:
            self.assertIn(status, ADMIN_STATUS_LABELS)


# --------------------------------------------------------------------------- #
# Бизнес-логика (service)
# --------------------------------------------------------------------------- #
class SupportServiceTests(unittest.TestCase):
    def _ticket_row(self, **overrides):
        row = {
            "id": 1,
            "public_id": "SUP-000001",
            "user_id": 2,
            "subject": "Проблема с заказом",
            "description": "Не изменяется статус заказа",
            "contact": "https://t.me/username",
            "status": "new",
            "assigned_admin_id": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "closed_at": None,
        }
        row.update(overrides)
        return row

    def _message_row(self, **overrides):
        row = {
            "id": 1,
            "ticket_id": 1,
            "sender_type": "user",
            "sender_user_id": 2,
            "message": "Не изменяется статус заказа",
            "created_at": datetime.now(timezone.utc),
            "telegram_message_id": None,
        }
        row.update(overrides)
        return row

    @patch("backend.support.service.SessionLocal")
    @patch("backend.support.service.repository.insert_message")
    @patch("backend.support.service.repository.insert_ticket")
    def test_create_ticket_uses_variant_b_and_hides_internal_id(self, insert_ticket, insert_message, session_local):
        session = _FakeSession()
        session_local.return_value = session
        insert_ticket.return_value = self._ticket_row()
        insert_message.return_value = self._message_row()

        result = SupportService.create_ticket(
            user_id=2,
            subject=None,
            message="Не изменяется статус моего заказа",
            contact="https://t.me/username",
        )

        insert_message.assert_called_once()
        self.assertEqual(insert_message.call_args.kwargs["sender_type"], SupportSenderType.USER.value)
        self.assertEqual(insert_message.call_args.kwargs["sender_user_id"], 2)
        self.assertEqual(insert_message.call_args.kwargs["message"], "Не изменяется статус моего заказа")
        # Публичный payload не раскрывает внутренний id.
        self.assertNotIn("id", result["ticket"])
        self.assertEqual(result["internal_ticket_id"], 1)
        self.assertEqual(result["ticket"]["public_id"], "SUP-000001")

    @patch("backend.support.service.SessionLocal")
    @patch("backend.support.service.repository.get_ticket_by_public_id")
    def test_user_cannot_read_foreign_ticket(self, get_ticket, session_local):
        session_local.return_value = _FakeSession()
        get_ticket.return_value = self._ticket_row(user_id=99)

        with self.assertRaises(TicketNotFoundError):
            SupportService.get_ticket(public_id="SUP-000001", user_id=2, is_admin=False)

    @patch("backend.support.service.SessionLocal")
    @patch("backend.support.service.repository.get_ticket_by_public_id")
    def test_user_cannot_send_message_to_closed_ticket(self, get_ticket, session_local):
        session_local.return_value = _FakeSession()
        get_ticket.return_value = self._ticket_row(user_id=2, status="closed")

        with self.assertRaises(TicketClosedError):
            SupportService.send_user_message(
                public_id="SUP-000001", user_id=2, message="Ещё один вопрос"
            )

    @patch("backend.support.service.SessionLocal")
    @patch("backend.support.service.repository.insert_message")
    @patch("backend.support.service.repository.update_ticket_status")
    @patch("backend.support.service.repository.get_ticket_by_public_id")
    def test_admin_change_status_records_system_event(self, get_ticket, update_status, insert_message, session_local):
        session_local.return_value = _FakeSession()
        get_ticket.return_value = self._ticket_row(status="new")
        updated = self._ticket_row(status="in_progress")
        update_status.return_value = updated

        result = SupportService.admin_change_status(
            public_id="SUP-000001", admin_user_id=1, status="in_progress"
        )

        self.assertEqual(insert_message.call_args.kwargs["sender_type"], SupportSenderType.SYSTEM.value)
        self.assertIn("Статус изменён", insert_message.call_args.kwargs["message"])
        self.assertEqual(result["ticket"]["status"], "in_progress")

    @patch("backend.support.service.SessionLocal")
    @patch("backend.support.service.repository.update_ticket_status")
    @patch("backend.support.service.repository.get_ticket_by_public_id")
    def test_close_is_idempotent(self, get_ticket, update_status, session_local):
        session_local.return_value = _FakeSession()
        get_ticket.return_value = self._ticket_row(status="closed")

        result = SupportService.close_ticket(public_id="SUP-000001", user_id=2)

        update_status.assert_not_called()
        self.assertEqual(result["ticket"]["status"], "closed")


# --------------------------------------------------------------------------- #
# Уведомления Telegram
# --------------------------------------------------------------------------- #
class SupportNotificationTests(unittest.TestCase):
    def test_escape_and_truncate(self):
        self.assertIn("&lt;script&gt;", notifications._escape("<script>"))
        long_text = "я" * 5000
        truncated = notifications._truncate(long_text)
        self.assertLessEqual(len(truncated), notifications.TELEGRAM_TEXT_LIMIT)
        self.assertIn("сокращено", truncated)

    @patch("backend.support.notifications._link_telegram_message")
    @patch("backend.support.notifications._send_message", return_value=None)
    def test_notification_failure_does_not_raise_or_link(self, send_message, link):
        result = notifications.send_new_ticket_notification(
            internal_ticket_id=1,
            public_id="SUP-000001",
            subject="Тема",
            description="Описание проблемы",
            contact="https://t.me/username",
            user_login="user",
            first_message_id=10,
        )
        self.assertIsNone(result)
        link.assert_not_called()

    @patch("backend.support.notifications._link_telegram_message")
    @patch("backend.support.notifications._send_message", return_value=555)
    def test_notification_links_telegram_message_id(self, send_message, link):
        result = notifications.send_new_user_reply_notification(
            internal_ticket_id=1,
            public_id="SUP-000001",
            user_login="user",
            message="Номер заказа #49281",
            support_message_id=10,
        )
        self.assertEqual(result, 555)
        link.assert_called_once_with(10, 555)


# --------------------------------------------------------------------------- #
# Безопасность Telegram-бота
# --------------------------------------------------------------------------- #
class TelegramBotSecurityTests(unittest.TestCase):
    @patch("backend.support.telegram_bot.config.TELEGRAM_SUPPORT_ADMIN_IDS", frozenset({111}))
    @patch("backend.support.telegram_bot.config.TELEGRAM_SUPPORT_CHAT_ID", "")
    def test_whitelist_rejects_foreign_telegram_user(self):
        from backend.support.telegram_bot import _is_allowed

        self.assertTrue(_is_allowed(111, 111))
        self.assertFalse(_is_allowed(999, 999))

    @patch("backend.support.telegram_bot.config.TELEGRAM_SUPPORT_ADMIN_IDS", frozenset({111}))
    @patch("backend.support.telegram_bot.config.TELEGRAM_SUPPORT_CHAT_ID", "42")
    def test_chat_id_is_checked_when_group_configured(self):
        from backend.support.telegram_bot import _is_allowed

        self.assertTrue(_is_allowed(111, 42))
        self.assertFalse(_is_allowed(111, 999))


# --------------------------------------------------------------------------- #
# Интеграционные тесты (требуют PostgreSQL *_test)
# --------------------------------------------------------------------------- #
@unittest.skipUnless(os.getenv("SUPPORT_TEST_DATABASE_URL"), "Requires SUPPORT_TEST_DATABASE_URL on a *_test DB")
class SupportApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        from sqlalchemy.orm import sessionmaker
        import uvicorn
        from fastapi import FastAPI

        url = os.environ["SUPPORT_TEST_DATABASE_URL"]
        if not (make_url(url).database or "").endswith("_test"):
            raise RuntimeError("Refusing to modify a database whose name does not end in _test")
        cls.engine = create_engine(url)
        cls.sessions = sessionmaker(bind=cls.engine)
        with cls.engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS migration_temp"))
            connection.execute(
                text(
                    """CREATE TABLE IF NOT EXISTS migration_temp.users (
                        id BIGSERIAL PRIMARY KEY, login TEXT, mail TEXT, password TEXT, balance NUMERIC DEFAULT 0
                    )"""
                )
            )
        raw = cls.engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                cursor.execute((Path(__file__).parents[1] / "migrations/006_support_tickets.sql").read_text())
            raw.commit()
        finally:
            raw.close()

        from backend.support.admin_router import router as admin_router
        from backend.support.router import router

        app = FastAPI()
        app.include_router(router)
        app.include_router(admin_router)

        def test_db():
            with cls.sessions() as session:
                yield session

        app.dependency_overrides[get_db] = test_db

        # Админ в тестах — пользователь с id = 1.
        cls.admin_patcher = patch("backend.core.config.ADMIN_USER_IDS", frozenset({1}))
        cls.admin_patcher.start()
        # Telegram в тестах не дёргаем.
        cls.tg_patcher = patch("backend.support.notifications._send_message", return_value=None)
        cls.tg_patcher.start()

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
        cls.admin_patcher.stop()
        cls.tg_patcher.stop()

    def setUp(self):
        from sqlalchemy import text

        with self.engine.begin() as connection:
            connection.execute(
                text("TRUNCATE migration_temp.support_messages, migration_temp.support_tickets RESTART IDENTITY CASCADE")
            )
            connection.execute(text("TRUNCATE migration_temp.users RESTART IDENTITY CASCADE"))
            connection.execute(
                text(
                    "INSERT INTO migration_temp.users(id, login, mail) "
                    "SELECT n, 'user-' || n, 'u' || n || '@example.test' FROM generate_series(1, 25) n"
                )
            )

    def request(self, path="", method="GET", body=None, user=None, token=None):
        headers = {"Content-Type": "application/json"}
        if user:
            token = create_access_token(user)
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(
            self.base + path,
            method=method,
            headers=headers,
            data=json.dumps(body).encode() if body is not None else None,
        )
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def create(self, user=2, message="Не изменяется статус моего заказа", contact="https://t.me/username"):
        return self.request("/api/support/tickets", "POST", {"message": message, "contact": contact}, user=user)

    def test_user_can_create_list_and_read_own_ticket(self):
        status, ticket = self.create()
        self.assertEqual(status, 201)
        self.assertTrue(ticket["public_id"].startswith("SUP-"))
        self.assertEqual(ticket["status"], "new")

        status, listing = self.request("/api/support/tickets", user=2)
        self.assertEqual(status, 200)
        self.assertEqual(len(listing["items"]), 1)
        self.assertEqual(listing["items"][0]["public_id"], ticket["public_id"])
        self.assertNotIn("id", listing["items"][0])

        status, detail = self.request(f"/api/support/tickets/{ticket['public_id']}", user=2)
        self.assertEqual(status, 200)
        self.assertEqual(len(detail["messages"]), 1)
        self.assertEqual(detail["messages"][0]["sender_type"], "user")

    def test_idor_is_blocked(self):
        _, ticket = self.create(user=2)
        self.assertEqual(self.request(f"/api/support/tickets/{ticket['public_id']}", user=3)[0], 404)
        self.assertEqual(
            self.request(f"/api/support/tickets/{ticket['public_id']}/messages", "POST", {"message": "взлом"}, user=3)[0],
            404,
        )
        self.assertEqual(
            self.request(f"/api/support/tickets/{ticket['public_id']}/close", "POST", user=3)[0],
            404,
        )

    def test_user_reply_and_close_flow(self):
        _, ticket = self.create(user=2)
        status, result = self.request(
            f"/api/support/tickets/{ticket['public_id']}/messages",
            "POST",
            {"message": "Номер заказа #49281"},
            user=2,
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["ticket"]["status"], "in_progress")

        status, closed = self.request(f"/api/support/tickets/{ticket['public_id']}/close", "POST", user=2)
        self.assertEqual(status, 200)
        self.assertEqual(closed["ticket"]["status"], "closed")
        self.assertIsNotNone(closed["ticket"]["closed_at"])

        # Сообщение в закрытый тикет запрещено.
        self.assertEqual(
            self.request(f"/api/support/tickets/{ticket['public_id']}/messages", "POST", {"message": "после закрытия"}, user=2)[0],
            409,
        )

    def test_http_validation(self):
        for body in [
            {"message": "short", "contact": "t.me/u"},
            {"message": "Достаточно длинное сообщение", "contact": ""},
            {"message": "Достаточно длинное сообщение", "contact": "<b>html</b>"},
        ]:
            self.assertEqual(self.request("/api/support/tickets", "POST", body, user=2)[0], 422)

    def test_admin_can_list_reply_and_change_status(self):
        _, ticket = self.create(user=2)
        status, listing = self.request("/api/admin/support/tickets", user=1)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(listing["total"], 1)

        status, detail = self.request(f"/api/admin/support/tickets/{ticket['public_id']}", user=1)
        self.assertEqual(status, 200)
        self.assertIn("id", detail)
        self.assertIn("user_login", detail)

        status, result = self.request(
            f"/api/admin/support/tickets/{ticket['public_id']}/messages",
            "POST",
            {"message": "Здравствуйте. Пришлите номер заказа."},
            user=1,
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["ticket"]["status"], "waiting_user")

        status, changed = self.request(
            f"/api/admin/support/tickets/{ticket['public_id']}/status",
            "PATCH",
            {"status": "closed"},
            user=1,
        )
        self.assertEqual(status, 200)
        self.assertEqual(changed["ticket"]["status"], "closed")

        # Не-админ не может пользоваться админскими endpoint'ами.
        self.assertEqual(self.request("/api/admin/support/tickets", user=2)[0], 403)


if __name__ == "__main__":
    unittest.main()
