import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Lock
from urllib.error import URLError
from unittest.mock import MagicMock, patch

from backend.payments.service import RetryDispatchError, dispatch_order, retry_dispatch_order
from backend.services.supplier import (
    SupplierBalance,
    SupplierOrder,
    SupplierRejectedError,
)


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


def local_order():
    return {
        "id": 601,
        "user_id": 151,
        "service_id": 10,
        "link": "https://example.com/account",
        "qnt": 1000,
        "amount": Decimal("150.00"),
    }


def service(*, base_rate="100.00", public_rate="150.00"):
    return {
        "provider_service_id": "10",
        "base_rate": base_rate,
        "price_per_1000": public_rate,
        "compare_price_per_1000": public_rate,
        "currency": "RUB",
    }


class SupplierDispatchTests(unittest.TestCase):
    def test_balance_unavailable_is_not_treated_as_zero(self):
        add = MagicMock()
        mark_unavailable = MagicMock()
        mark_insufficient = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                side_effect=URLError("offline"),
            ),
            patch("backend.payments.service.create_supplier_order", add),
            patch(
                "backend.payments.service.mark_supplier_precheck_unavailable",
                mark_unavailable,
            ),
            patch(
                "backend.payments.service.mark_insufficient_supplier_balance",
                mark_insufficient,
            ),
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "supplier_unavailable")
        add.assert_not_called()
        mark_unavailable.assert_called_once()
        mark_insufficient.assert_not_called()

    def test_add_timeout_becomes_unknown_and_is_not_retried(self):
        add = MagicMock(side_effect=TimeoutError("timeout"))
        mark_unknown = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch("backend.payments.service.create_supplier_order", add),
            patch("backend.payments.service.mark_dispatch_unknown", mark_unknown),
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "unknown")
        add.assert_called_once()
        mark_unknown.assert_called_once()

    def test_supplier_error_becomes_manual_rejection_without_refund(self):
        mark_rejected = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                side_effect=SupplierRejectedError("Invalid link"),
            ),
            patch("backend.payments.service.mark_dispatch_rejected", mark_rejected),
            patch("backend.payments.service.set_user_balance") as set_balance,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "rejected")
        mark_rejected.assert_called_once()
        set_balance.assert_not_called()

    def test_save_failure_records_known_supplier_id_for_review(self):
        recover = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ),
            patch(
                "backend.payments.service.complete_order_dispatch",
                side_effect=RuntimeError("database write failed"),
            ),
            patch("backend.payments.service.record_supplier_order_for_review", recover),
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "save_failed")
        self.assertEqual(recover.call_args.kwargs["supplier_order_id"], 9001)

    def test_two_concurrent_dispatches_call_add_once(self):
        claim_lock = Lock()
        claimed = False

        def claim_once(_session, _order_id):
            nonlocal claimed
            with claim_lock:
                if claimed:
                    return None
                claimed = True
                return local_order()

        add = MagicMock(return_value=SupplierOrder(9001))
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", side_effect=claim_once),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch("backend.payments.service.create_supplier_order", add),
            patch("backend.payments.service.complete_order_dispatch"),
        ):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(dispatch_order, [601, 601]))

        self.assertIn("completed", results)
        self.assertIn("not_dispatchable", results)
        add.assert_called_once()

    def test_unknown_add_result_cannot_be_retried(self):
        state = {
            "id": 601,
            "id_rocket": 0,
            "payment_status": "processed",
            "processed_at": object(),
            "dispatch_status": "unknown",
        }
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_order_dispatch_state", return_value=state),
            patch("backend.payments.service.dispatch_order") as dispatch,
        ):
            with self.assertRaises(RetryDispatchError):
                retry_dispatch_order(601)
        dispatch.assert_not_called()

    def test_sufficient_balance_allows_add_using_supplier_cost(self):
        mark_insufficient = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch("backend.payments.service.get_service_by_id", return_value=service()),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("120.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ) as create_order,
            patch("backend.payments.service.complete_order_dispatch") as complete,
            patch(
                "backend.payments.service.mark_insufficient_supplier_balance",
                mark_insufficient,
            ),
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "completed")
        create_order.assert_called_once()
        complete.assert_called_once()
        mark_insufficient.assert_not_called()

    def test_insufficient_balance_blocks_without_add(self):
        add = MagicMock()
        mark_insufficient = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="500.00", public_rate="750.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("100.00"), "RUB"),
            ),
            patch("backend.payments.service.create_supplier_order", add),
            patch(
                "backend.payments.service.mark_insufficient_supplier_balance",
                mark_insufficient,
            ),
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "insufficient_supplier_balance")
        add.assert_not_called()
        mark_insufficient.assert_called_once()

    def test_public_150_does_not_block_supplier_cost_100_with_balance_120(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.00", public_rate="150.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("120.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ) as add,
            patch("backend.payments.service.complete_order_dispatch"),
        ):
            self.assertEqual(dispatch_order(601), "completed")
        add.assert_called_once()


if __name__ == "__main__":
    unittest.main()
