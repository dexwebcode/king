import asyncio
import json
import unittest
import urllib.parse
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from backend.admin import dependencies as admin_dependencies
from backend.auth.security import create_access_token
from backend.main import app
from backend.services.get_price import calculate_supplier_order_cost
from backend.services.supplier import (
    SupplierBalance,
    SupplierRejectedError,
    cancel_supplier_order,
    create_supplier_order,
    get_supplier_balance,
    get_supplier_order_status,
    refill_supplier_order,
)


class FakeResponse:
    def __init__(self, payload):
        self.body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return self.body


class SupplierClientTests(unittest.TestCase):
    def supplier_response(self, payload, expected_action):
        def open_request(request, timeout):
            self.assertEqual(request.method, "POST")
            self.assertEqual(timeout, 20)
            self.assertEqual(
                request.headers["Content-type"],
                "application/x-www-form-urlencoded",
            )
            form = urllib.parse.parse_qs(request.data.decode("utf-8"))
            self.assertEqual(form["key"], ["unit-test-key"])
            self.assertEqual(form["action"], [expected_action])
            return FakeResponse(payload)

        return open_request

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_balance(self, urlopen):
        urlopen.side_effect = self.supplier_response(
            {"balance": "9999.99", "currency": "RUB"},
            "balance",
        )
        result = get_supplier_balance()
        self.assertEqual(result.balance, Decimal("9999.99"))
        self.assertEqual(result.currency, "RUB")

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_add(self, urlopen):
        urlopen.side_effect = self.supplier_response({"order": "123"}, "add")
        result = create_supplier_order(
            service_id=7,
            recipient_link="https://example.com/account",
            quantity=1000,
        )
        self.assertEqual(result.order_id, 123)

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_status(self, urlopen):
        urlopen.side_effect = self.supplier_response(
            {
                "charge": "0.3",
                "currency": "RUB",
                "service": "1",
                "link": "https://instagram.com/instagram",
                "quantity": "100",
                "start_count": "0",
                "date": "23:06:26 27.04.2022",
                "status": "In progress",
                "remains": "100",
            },
            "status",
        )
        result = get_supplier_order_status(123)
        self.assertEqual(result.order_id, 123)
        self.assertEqual(result.charge, Decimal("0.3"))
        self.assertEqual(result.service_id, 1)
        self.assertEqual(result.status, "In progress")
        self.assertEqual(result.remains, 100)

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_cancel(self, urlopen):
        urlopen.side_effect = self.supplier_response({"cancel": "ok"}, "cancel")
        self.assertIsNone(cancel_supplier_order(123))

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_refill(self, urlopen):
        urlopen.side_effect = self.supplier_response({"refill": "123"}, "refill")
        self.assertEqual(refill_supplier_order(100).refill_id, 123)

    @patch("backend.services.supplier.KINGPROMOTION_API_KEY", "unit-test-key")
    @patch("backend.services.supplier.urllib.request.urlopen")
    def test_error(self, urlopen):
        urlopen.side_effect = self.supplier_response(
            {"error": "Not enough funds"},
            "balance",
        )
        with self.assertRaisesRegex(SupplierRejectedError, "Not enough funds"):
            get_supplier_balance()

    def test_supplier_cost_never_uses_public_price(self):
        service = {
            "base_rate": "100.00",
            "price_per_1000": "150.00",
            "compare_price_per_1000": "175.00",
        }
        self.assertEqual(
            calculate_supplier_order_cost(service, 1000),
            Decimal("100.00"),
        )


class AdminSecurityTests(unittest.TestCase):
    @staticmethod
    async def request_status(token):
        messages = []
        sent_request = False

        async def receive():
            nonlocal sent_request
            if not sent_request:
                sent_request = True
                return {"type": "http.request", "body": b"", "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)

        await app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "GET",
                "scheme": "http",
                "path": "/api/admin/supplier/balance",
                "raw_path": b"/api/admin/supplier/balance",
                "query_string": b"",
                "headers": [(b"authorization", f"Bearer {token}".encode())],
                "client": ("test", 123),
                "server": ("testserver", 80),
                "root_path": "",
            },
            receive,
            send,
        )
        return next(
            message["status"]
            for message in messages
            if message["type"] == "http.response.start"
        )

    @patch(
        "backend.admin.router.get_admin_supplier_balance",
        return_value=(
            SupplierBalance(Decimal("1000.00"), "RUB"),
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
    )
    @patch("backend.auth.dependencies.get_user_by_id")
    def test_regular_jwt_get_is_forbidden_and_admin_jwt_is_allowed(
        self,
        get_user,
        _balance,
    ):
        get_user.side_effect = lambda _session, user_id: {
            "id": user_id,
            "login": f"user-{user_id}",
            "mail": f"user-{user_id}@example.com",
        }
        with patch.object(admin_dependencies.config, "ADMIN_USER_IDS", frozenset({5})):
            self.assertEqual(
                asyncio.run(self.request_status(create_access_token(4))),
                403,
            )
            self.assertEqual(
                asyncio.run(self.request_status(create_access_token(5))),
                200,
            )


if __name__ == "__main__":
    unittest.main()
