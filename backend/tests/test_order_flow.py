import asyncio
import json
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

from fastapi import BackgroundTasks

from backend.payments.router import my_orders_endpoint, yookassa_webhook
from backend.services.supplier import SupplierBalance, SupplierOrder


class FakeRequest:
    async def body(self):
        return json.dumps({
            "event": "payment.succeeded",
            "object": {"id": "payment-1"},
        }).encode("utf-8")


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


class AutomaticOrderFlowTests(unittest.TestCase):
    @staticmethod
    def order():
        return {
            "id": 601,
            "user_id": 151,
            "service_id": 10,
            "link": "https://example.com/account",
            "qnt": 1000,
            "amount": Decimal("150.00"),
        }

    @staticmethod
    def service():
        return {
            "provider_service_id": "10",
            "base_rate": "100.00",
            "price_per_1000": "150.00",
            "compare_price_per_1000": "175.00",
            "currency": "RUB",
        }

    def test_webhook_automatically_dispatches_successful_order(self):
        background_tasks = BackgroundTasks()
        add = MagicMock(return_value=SupplierOrder(9001))
        complete = MagicMock()

        with (
            patch("backend.payments.router.verify_payment_notification", return_value=601),
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.claim_order_for_dispatch",
                return_value=self.order(),
            ),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=self.service(),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("120.00"), "RUB"),
            ) as balance,
            patch("backend.payments.service.create_supplier_order", add),
            patch("backend.payments.service.complete_order_dispatch", complete),
        ):
            response = asyncio.run(yookassa_webhook(FakeRequest(), background_tasks))
            asyncio.run(background_tasks())

        self.assertEqual(response, {"status": "ok"})
        balance.assert_called_once()
        add.assert_called_once()
        complete.assert_called_once_with(
            unittest.mock.ANY,
            order_id=601,
            supplier_order_id=9001,
        )

    def test_duplicate_webhook_schedules_supplier_dispatch_once(self):
        first_tasks = BackgroundTasks()
        second_tasks = BackgroundTasks()

        with (
            patch(
                "backend.payments.router.verify_payment_notification",
                side_effect=[601, None],
            ),
            patch("backend.payments.router.dispatch_order") as dispatch,
        ):
            asyncio.run(yookassa_webhook(FakeRequest(), first_tasks))
            asyncio.run(yookassa_webhook(FakeRequest(), second_tasks))
            asyncio.run(first_tasks())
            asyncio.run(second_tasks())

        dispatch.assert_called_once_with(601)

    def test_order_list_is_paginated_and_does_not_fan_out_sync(self):
        order = {
            "id": 601,
            "soc": "instagram",
            "service_id": 10,
            "link": "https://example.com/account",
            "qnt": 1000,
            "amount": Decimal("150.00"),
            "status": "Выполняется",
            "dispatch_status": "completed",
            "remains": 500,
            "id_rocket": 9001,
            "date": "12:00:00 01.01.2026",
        }
        with (
            patch("backend.payments.router.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.router.get_user_orders", return_value=[order]),
            patch("backend.payments.router.sync_order_safely") as sync,
        ):
            response = my_orders_endpoint(current_user={"id": 151})

        self.assertEqual(response["items"][0]["remains"], 500)
        self.assertIsNone(response["next_cursor"])
        sync.assert_not_called()


if __name__ == "__main__":
    unittest.main()
