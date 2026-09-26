import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from threading import Lock
from urllib.error import URLError
from unittest.mock import MagicMock, call, patch

from backend.payments.service import (
    DispatchResolutionError,
    RetryDispatchError,
    _notify_price_conflict,
    _prepare_order_attempt,
    alert_stale_dispatch_orders,
    dispatch_order,
    dispatch_pending_orders,
    resolve_dispatch_order,
    retry_dispatch_order,
    retry_pending_provider_cancellations,
    sync_due_orders,
)
from backend.payments.repository import get_stale_dispatch_orders_for_alert
from backend.services.supplier import (
    SupplierBalance,
    SupplierOrder,
    SupplierOrderStatus,
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
        order = {**local_order(), "supplier_cost": Decimal("500.00")}
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=order),
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

    def test_supplier_price_drift_blocks_dispatch(self):
        order = {**local_order(), "supplier_cost": Decimal("100.00")}
        mark_price_changed = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=order),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="150.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch("backend.payments.service.create_supplier_order") as add,
            patch(
                "backend.payments.service.mark_dispatch_price_changed",
                mark_price_changed,
            ),
            patch("backend.payments.service._notify_price_conflict") as notify,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "price_changed")
        add.assert_not_called()
        mark_price_changed.assert_called_once()
        message = mark_price_changed.call_args.kwargs["error_message"]
        self.assertIn("required=150.00", message)
        self.assertIn("snapshot=100.00", message)
        notify.assert_called_once()

    def test_supplier_small_price_drift_is_allowed(self):
        # Рост себестоимости на 0.5% не должен блокировать отправку (порог 2%).
        order = {**local_order(), "supplier_cost": Decimal("100.00")}
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=order),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.50"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ) as add,
            patch("backend.payments.service.complete_order_dispatch"),
            patch(
                "backend.payments.service.mark_dispatch_price_changed",
            ) as mark_price_changed,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "completed")
        add.assert_called_once()
        mark_price_changed.assert_not_called()

    def test_supplier_price_unchanged_dispatches(self):
        order = {**local_order(), "supplier_cost": Decimal("100.00")}
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=order),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ) as add,
            patch("backend.payments.service.complete_order_dispatch"),
            patch(
                "backend.payments.service.mark_dispatch_price_changed",
            ) as mark_price_changed,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "completed")
        add.assert_called_once()
        mark_price_changed.assert_not_called()

    def test_legacy_order_with_healthy_margin_dispatches(self):
        # Legacy-заказ без снимка с положительной маржой отправляется как обычно.
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch(
                "backend.payments.service.create_supplier_order",
                return_value=SupplierOrder(9001),
            ) as add,
            patch("backend.payments.service.complete_order_dispatch"),
            patch(
                "backend.payments.service.mark_dispatch_price_changed",
            ) as mark_price_changed,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "completed")
        add.assert_called_once()
        mark_price_changed.assert_not_called()

    def test_legacy_order_with_negative_margin_goes_to_review(self):
        # Legacy-заказ без снимка: себестоимость >= цены продажи → ручная проверка.
        mark_price_changed = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_order_for_dispatch", return_value=local_order()),
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="200.00"),
            ),
            patch(
                "backend.payments.service.get_supplier_balance",
                return_value=SupplierBalance(Decimal("1000.00"), "RUB"),
            ),
            patch("backend.payments.service.create_supplier_order") as add,
            patch(
                "backend.payments.service.mark_dispatch_price_changed",
                mark_price_changed,
            ),
            patch("backend.payments.service._notify_price_conflict") as notify,
        ):
            result = dispatch_order(601)

        self.assertEqual(result, "price_changed")
        add.assert_not_called()
        mark_price_changed.assert_called_once()
        self.assertIn(
            "legacy order",
            mark_price_changed.call_args.kwargs["error_message"],
        )
        notify.assert_called_once()

    def test_prepare_order_rejects_zero_margin(self):
        with (
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.00", public_rate="100.00"),
            ),
            patch("backend.payments.service.validate_service_quantity"),
            patch("backend.payments.service._create_or_get_attempt") as create,
        ):
            with self.assertRaises(ValueError):
                _prepare_order_attempt(
                    user_id=151,
                    service_id=10,
                    quantity=1000,
                    recipient_link="https://example.com/account",
                    idempotence_key="00000000-0000-0000-0000-000000000001",
                    provider="yookassa",
                )
        create.assert_not_called()

    def test_prepare_order_rejects_margin_below_fee(self):
        # Маржа 1% не покрывает комиссию 3% → заказ не создаётся.
        with (
            patch(
                "backend.payments.service.get_service_by_id",
                return_value=service(base_rate="100.00", public_rate="101.00"),
            ),
            patch("backend.payments.service.validate_service_quantity"),
            patch("backend.payments.service._create_or_get_attempt") as create,
        ):
            with self.assertRaises(ValueError):
                _prepare_order_attempt(
                    user_id=151,
                    service_id=10,
                    quantity=1000,
                    recipient_link="https://example.com/account",
                    idempotence_key="00000000-0000-0000-0000-000000000001",
                    provider="yookassa",
                )
        create.assert_not_called()

    def test_notify_price_conflict_sends_admin_alert(self):
        with patch("backend.support.notifications.send_admin_alert") as send:
            _notify_price_conflict(601, "подробности")
        send.assert_called_once()
        self.assertIn("601", send.call_args.args[0])

    def test_retry_cancel_credits_when_payment_succeeded(self):
        payment = type("Payment", (), {"status": "succeeded"})()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_pending_provider_cancellations",
                return_value=[{"id": 501, "provider_payment_id": "pay-1"}],
            ),
            patch(
                "backend.payments.service.get_yookassa_payment",
                return_value=payment,
            ),
            patch(
                "backend.payments.service.process_verified_payment",
                return_value=601,
            ) as process,
            patch("backend.payments.service.dispatch_order") as dispatch,
            patch("backend.payments.service.clear_provider_cancel_pending") as clear,
        ):
            result = retry_pending_provider_cancellations(limit=10)

        self.assertEqual(result, 1)
        process.assert_called_once_with(payment)
        dispatch.assert_called_once_with(601)
        clear.assert_called_once()

    def test_retry_cancel_cancels_when_payment_pending(self):
        payment = type("Payment", (), {"status": "pending"})()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_pending_provider_cancellations",
                return_value=[{"id": 501, "provider_payment_id": "pay-1"}],
            ),
            patch(
                "backend.payments.service.get_yookassa_payment",
                return_value=payment,
            ),
            patch("backend.payments.service.cancel_yookassa_payment") as cancel,
            patch("backend.payments.service.clear_provider_cancel_pending") as clear,
        ):
            result = retry_pending_provider_cancellations(limit=10)

        self.assertEqual(result, 1)
        cancel.assert_called_once_with("pay-1", "cancel-retry-501")
        clear.assert_called_once()

    def test_retry_cancel_failure_alerts_admin(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_pending_provider_cancellations",
                return_value=[{"id": 501, "provider_payment_id": "pay-1"}],
            ),
            patch(
                "backend.payments.service.get_yookassa_payment",
                side_effect=TimeoutError("down"),
            ),
            patch("backend.payments.service.mark_provider_cancel_pending") as bump,
            patch("backend.payments.service._send_admin_alert_safely") as alert,
        ):
            result = retry_pending_provider_cancellations(limit=10)

        self.assertEqual(result, 1)
        bump.assert_called_once()
        alert.assert_called_once()

    def test_alert_stale_dispatch_orders_marks_and_alerts_once_each(self):
        rows = [
            {
                "id": 601,
                "link": "https://example.com/1",
                "qnt": 1000,
                "amount": Decimal("150.00"),
                "dispatch_status": "sending",
            },
            {
                "id": 602,
                "link": "https://example.com/2",
                "qnt": 2000,
                "amount": Decimal("300.00"),
                "dispatch_status": "unknown",
            },
        ]
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_stale_dispatch_orders_for_alert",
                return_value=rows,
            ),
            patch("backend.payments.service.mark_dispatch_alerted") as mark,
            patch("backend.payments.service._send_admin_alert_safely") as alert,
        ):
            result = alert_stale_dispatch_orders(limit=10)

        self.assertEqual(result, 2)
        # Каждый заказ помечается и алертится ровно один раз.
        self.assertEqual(mark.call_count, 2)
        self.assertEqual(alert.call_count, 2)

    def test_stale_dispatch_alert_query_filters_unalerted(self):
        statements = []

        class RecordingSession:
            def execute(self, statement, params=None):
                statements.append(str(statement))
                return self

            def mappings(self):
                return self

            def all(self):
                return []

        get_stale_dispatch_orders_for_alert(
            RecordingSession(), limit=10, stale_minutes=5
        )
        self.assertTrue(
            any("dispatch_alerted_at IS NULL" in sql for sql in statements)
        )

    def test_dispatch_pending_orders_processes_candidates_and_counts_claims(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_dispatch_candidate_ids",
                return_value=[601, 602, 603],
            ) as candidates,
            patch(
                "backend.payments.service.dispatch_order",
                side_effect=[
                    "completed",
                    "not_dispatchable",
                    "insufficient_supplier_balance",
                ],
            ) as dispatch,
        ):
            result = dispatch_pending_orders(limit=3)

        self.assertEqual(result, {"candidates": 3, "claimed": 2})
        self.assertEqual(candidates.call_count, 1)
        self.assertEqual(candidates.call_args.kwargs["limit"], 3)
        self.assertEqual(
            dispatch.call_args_list,
            [call(601), call(602), call(603)],
        )

    def test_dispatch_pending_orders_swallows_individual_failures(self):
        def flaky(order_id):
            if order_id == 602:
                raise RuntimeError("boom")
            return "completed"

        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_dispatch_candidate_ids",
                return_value=[601, 602, 603],
            ),
            patch("backend.payments.service.dispatch_order", side_effect=flaky),
        ):
            result = dispatch_pending_orders(limit=3)

        self.assertEqual(result, {"candidates": 3, "claimed": 2})

    def test_sync_due_orders_syncs_and_marks_each(self):
        rows = [{"id": 601, "user_id": 151}, {"id": 602, "user_id": 152}]
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_orders_due_for_status_sync",
                return_value=rows,
            ),
            patch("backend.payments.service.sync_order_with_supplier") as sync,
            patch("backend.payments.service.mark_order_status_synced") as mark,
        ):
            result = sync_due_orders(limit=10)

        self.assertEqual(result, 2)
        self.assertEqual(sync.call_args_list, [call(601, 151), call(602, 152)])
        self.assertEqual(mark.call_count, 2)

    def test_sync_due_orders_continues_after_failure(self):
        rows = [{"id": 601, "user_id": 151}, {"id": 602, "user_id": 152}]

        def flaky(order_id, user_id):
            if order_id == 601:
                raise RuntimeError("boom")

        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_orders_due_for_status_sync",
                return_value=rows,
            ),
            patch("backend.payments.service.sync_order_with_supplier", side_effect=flaky),
            patch("backend.payments.service.mark_order_status_synced") as mark,
        ):
            result = sync_due_orders(limit=10)

        self.assertEqual(result, 2)
        self.assertEqual(mark.call_count, 2)


def uncertain_order(
    dispatch_status="sending",
    *,
    started_minutes_ago=6,
    link="https://example.com/account",
):
    started_at = (
        datetime.now(timezone.utc) - timedelta(minutes=started_minutes_ago)
        if dispatch_status == "sending"
        else None
    )
    return {
        "id": 601,
        "id_rocket": 0,
        "service_id": 10,
        "link": link,
        "qnt": 1000,
        "payment_status": "processed",
        "processed_at": object(),
        "dispatch_status": dispatch_status,
        "dispatch_started_at": started_at,
    }


def supplier_status(link="https://example.com/account"):
    return SupplierOrderStatus(
        order_id=9001,
        charge=Decimal("100.00"),
        currency="RUB",
        service_id=10,
        link=link,
        quantity=1000,
        start_count=0,
        date="12:00:00 01.01.2026",
        status="In progress",
        remains=0,
    )


class DispatchResolutionTests(unittest.TestCase):
    def test_resolve_not_created_reopens_stale_sending(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_order_dispatch_state",
                return_value=uncertain_order("sending"),
            ),
            patch(
                "backend.payments.service.reopen_dispatch_for_retry",
                return_value=True,
            ) as reopen,
            patch(
                "backend.payments.service.dispatch_order",
                return_value="completed",
            ) as dispatch,
        ):
            result = resolve_dispatch_order(601, resolution="not_created")

        self.assertEqual(result, "completed")
        self.assertEqual(reopen.call_count, 1)
        self.assertEqual(reopen.call_args.args[1], 601)
        dispatch.assert_called_once_with(601)

    def test_resolve_refuses_fresh_sending(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_order_dispatch_state",
                return_value=uncertain_order("sending", started_minutes_ago=1),
            ),
            patch("backend.payments.service.dispatch_order") as dispatch,
        ):
            with self.assertRaises(DispatchResolutionError):
                resolve_dispatch_order(601, resolution="not_created")
        dispatch.assert_not_called()

    def test_resolve_record_order_verifies_and_records(self):
        record = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_order_dispatch_state",
                return_value=uncertain_order("unknown"),
            ),
            patch(
                "backend.payments.service.get_supplier_order_status",
                return_value=supplier_status(),
            ),
            patch(
                "backend.payments.service.record_reconciled_supplier_order",
                record,
            ),
        ):
            result = resolve_dispatch_order(
                601,
                resolution="record_order",
                supplier_order_id=9001,
            )

        self.assertEqual(result, "recorded")
        record.assert_called_once()
        self.assertEqual(record.call_args.kwargs["supplier_order_id"], 9001)
        self.assertEqual(record.call_args.kwargs["status"], "Выполняется")

    def test_resolve_record_order_rejects_link_mismatch(self):
        record = MagicMock()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_order_dispatch_state",
                return_value=uncertain_order("unknown"),
            ),
            patch(
                "backend.payments.service.get_supplier_order_status",
                return_value=supplier_status(link="https://example.com/other"),
            ),
            patch(
                "backend.payments.service.record_reconciled_supplier_order",
                record,
            ),
        ):
            with self.assertRaises(DispatchResolutionError):
                resolve_dispatch_order(
                    601,
                    resolution="record_order",
                    supplier_order_id=9001,
                )
        record.assert_not_called()

    def test_resolve_record_order_wraps_supplier_error(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_order_dispatch_state",
                return_value=uncertain_order("unknown"),
            ),
            patch(
                "backend.payments.service.get_supplier_order_status",
                side_effect=SupplierRejectedError("Order not found"),
            ),
        ):
            with self.assertRaises(DispatchResolutionError):
                resolve_dispatch_order(
                    601,
                    resolution="record_order",
                    supplier_order_id=9001,
                )


if __name__ == "__main__":
    unittest.main()
