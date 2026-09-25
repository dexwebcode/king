"""Автоотмена неоплаченных платежей и покупательские статусы заказов."""

import unittest
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from fastapi import BackgroundTasks

from backend.payments.router import display_order_status, my_orders_endpoint
from backend.payments.service import expire_stale_payments


def attempt(**overrides):
    base = {
        "id": 501,
        "provider": "crystalpay",
        "provider_payment_id": "invoice-1",
        "confirmation_url": "https://pay.crystalpay.io/invoice-1",
        "user_id": 151,
        "order_id": 601,
        "amount": Decimal("100.00"),
        "currency": "RUB",
        "purpose": "order",
        "status": "created",
        "processed_at": None,
    }
    base.update(overrides)
    return base


class FakeTransaction:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class FakeSession:
    def begin(self):
        return FakeTransaction()

    def close(self):
        pass


class DisplayOrderStatusTests(unittest.TestCase):
    def test_payment_states_are_named_for_the_customer(self):
        self.assertEqual(display_order_status("Ожидает оплаты"), "Ожидает оплаты")
        self.assertEqual(display_order_status("Оплата отменена"), "Отменён")
        self.assertEqual(display_order_status("Отменен"), "Отменён")
        self.assertEqual(display_order_status("Отменен поставщиком"), "Отменён")

    def test_paid_states_collapse_to_paid(self):
        for status in (
            "Ожидает отправки",
            "Отправляется",
            "Ожидает пополнения поставщика",
            "Выполняется",
        ):
            with self.subTest(status=status):
                self.assertEqual(display_order_status(status), "Оплачен")

    def test_finished_states_are_distinct(self):
        self.assertEqual(display_order_status("Готово"), "Выполнен")
        self.assertEqual(display_order_status("Частично"), "Выполнен частично")

    def test_unknown_status_is_passed_through(self):
        self.assertEqual(display_order_status("Новый статус"), "Новый статус")


class MyOrdersResponseTests(unittest.TestCase):
    def test_order_row_carries_the_customer_status(self):
        stored = {
            "id": 601,
            "soc": "instagram",
            "service_id": 1,
            "link": "https://example.com",
            "qnt": 10,
            "amount": Decimal("100.00"),
            "status": "Оплата отменена",
            "dispatch_status": None,
            "remains": 0,
            "id_rocket": 0,
            "date": "10:00:00 24.09.2026",
        }
        with patch("backend.payments.router.get_user_orders", return_value=[stored]):
            response = my_orders_endpoint(BackgroundTasks(), {"id": 151})

        self.assertEqual(response["items"][0]["display_status"], "Отменён")
        self.assertEqual(response["items"][0]["status"], "Оплата отменена")


class ExpireStalePaymentsTests(unittest.IsolatedAsyncioTestCase):
    async def test_unpaid_attempt_is_expired_and_its_order_is_cancelled(self):
        expired_calls = []
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.list_expired_unpaid_attempts",
                return_value=[attempt()],
            ) as list_attempts,
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(return_value={"id": "invoice-1", "state": "notpayed"}),
            ),
            patch(
                "backend.payments.service.expire_payment_attempt",
                side_effect=lambda session, *, attempt_id, order_id: (
                    expired_calls.append((attempt_id, order_id)) or True
                ),
            ),
        ):
            result = await expire_stale_payments(timeout_minutes=15)

        self.assertEqual(result, {"checked": 1, "credited": 0, "expired": 1, "unverified": 0})
        self.assertEqual(expired_calls, [(501, 601)])
        self.assertEqual(list_attempts.call_args.kwargs["timeout_minutes"], 15)

    async def test_paid_attempt_is_credited_instead_of_expired(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.list_expired_unpaid_attempts",
                return_value=[attempt()],
            ),
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(return_value={"id": "invoice-1", "state": "payed"}),
            ),
            patch(
                "backend.payments.service.process_crystalpay_invoice",
                return_value=601,
            ) as process,
            patch("backend.payments.service.dispatch_order") as dispatch,
            patch("backend.payments.service.expire_payment_attempt") as expire,
        ):
            result = await expire_stale_payments(timeout_minutes=15)

        self.assertEqual(result["credited"], 1)
        self.assertEqual(result["expired"], 0)
        process.assert_called_once()
        dispatch.assert_called_once_with(601)
        expire.assert_not_called()

    async def test_unreachable_provider_still_expires_the_attempt(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.list_expired_unpaid_attempts",
                return_value=[attempt()],
            ),
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(side_effect=RuntimeError("network down")),
            ),
            patch(
                "backend.payments.service.expire_payment_attempt",
                return_value=True,
            ) as expire,
        ):
            result = await expire_stale_payments(timeout_minutes=15)

        self.assertEqual(result["unverified"], 1)
        self.assertEqual(result["expired"], 1)
        expire.assert_called_once()

    async def test_attempt_without_provider_id_is_expired_without_lookup(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.list_expired_unpaid_attempts",
                return_value=[attempt(provider_payment_id=None)],
            ),
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(),
            ) as get_invoice,
            patch(
                "backend.payments.service.expire_payment_attempt",
                return_value=True,
            ),
        ):
            result = await expire_stale_payments(timeout_minutes=15)

        get_invoice.assert_not_awaited()
        self.assertEqual(result["expired"], 1)

    async def test_fresh_attempts_are_untouched(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.list_expired_unpaid_attempts",
                return_value=[],
            ),
            patch("backend.payments.service.expire_payment_attempt") as expire,
        ):
            result = await expire_stale_payments(timeout_minutes=15)

        self.assertEqual(result, {"checked": 0, "credited": 0, "expired": 0, "unverified": 0})
        expire.assert_not_called()


if __name__ == "__main__":
    unittest.main()
