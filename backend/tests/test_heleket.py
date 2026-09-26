import json
import threading
import unittest
import uuid as uuid_module
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pydantic
from fastapi import BackgroundTasks, HTTPException
from heleket_sdk import sign

from backend.payments.router import (
    create_heleket_topup_endpoint,
    heleket_payment_status_endpoint,
    heleket_webhook,
)
from backend.payments.schemas import CreateHeleketTopUpRequest
from backend.payments.service import (
    PaymentVerificationError,
    create_heleket_order_payment,
    create_heleket_topup,
    process_heleket_webhook_payload,
)


class FakeRequest:
    def __init__(self, payload_bytes):
        self.payload_bytes = payload_bytes

    async def body(self):
        return self.payload_bytes


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


class LockedTransaction(FakeTransaction):
    def __init__(self, lock):
        self.lock = lock

    def __enter__(self):
        self.lock.acquire()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.lock.release()
        return False


class LockedSession(FakeSession):
    def __init__(self, lock):
        self.lock = lock

    def begin(self):
        return LockedTransaction(self.lock)


class FakeInvoice:
    def __init__(self, order_id="hk_151_abc", amount="100.00"):
        self.uuid = "heleket-uuid-1"
        self.url = "https://pay.heleket.com/checkout"
        self.order_id = order_id
        self.amount = amount


def heleket_attempt(*, processed=False, amount="100.00", status="pending"):
    return {
        "id": 501,
        "provider": "heleket",
        "provider_order_id": "hk_151_abc",
        "provider_payment_id": "heleket-uuid-1",
        "confirmation_url": "https://pay.heleket.com/checkout",
        "user_id": 151,
        "order_id": None,
        "amount": Decimal(amount),
        "currency": "RUB",
        "purpose": "balance_topup",
        "status": status,
        "processed_at": datetime.now(timezone.utc) if processed else None,
    }


def webhook_payload(status="paid"):
    return {
        "type": "payment",
        "uuid": "heleket-uuid-1",
        "order_id": "hk_151_abc",
        "status": status,
        "payment_amount": "0.001",
        "merchant_amount": "100.00",
        "currency": "RUB",
        "payer_currency": "USDT",
    }


def signed_body(payload, api_key):
    without_sign = json.dumps(payload, separators=(",", ":"))
    expected = sign(without_sign, api_key)
    return json.dumps({**payload, "sign": expected}, separators=(",", ":")).encode("utf-8")


class HeleketSignatureTests(unittest.IsolatedAsyncioTestCase):
    async def test_fake_webhook_with_bad_signature_is_rejected(self):
        raw = json.dumps(
            {**webhook_payload(), "sign": "0" * 32},
            separators=(",", ":"),
        ).encode("utf-8")
        with (
            patch("backend.payments.router.validate_heleket_configuration"),
            patch("backend.payments.router.HELEKET_PAYMENT_API_KEY", "test-key"),
            patch("backend.payments.router.process_heleket_webhook_payload") as process,
        ):
            with self.assertRaises(HTTPException) as context:
                await heleket_webhook(FakeRequest(raw), BackgroundTasks())
        self.assertEqual(context.exception.status_code, 400)
        process.assert_not_called()

    async def test_valid_signature_is_verified_and_processed(self):
        raw = signed_body(webhook_payload(), "test-key")
        with (
            patch("backend.payments.router.validate_heleket_configuration"),
            patch("backend.payments.router.HELEKET_PAYMENT_API_KEY", "test-key"),
            patch(
                "backend.payments.router.process_heleket_webhook_payload",
                return_value=True,
            ) as process,
        ):
            response = await heleket_webhook(FakeRequest(raw), BackgroundTasks())
        self.assertEqual(response, {"status": "ok", "credited": True})
        process.assert_called_once()

    async def test_webhook_with_unknown_type_is_rejected(self):
        payload = {**webhook_payload(), "type": "payout"}
        raw = signed_body(payload, "test-key")
        with (
            patch("backend.payments.router.validate_heleket_configuration"),
            patch("backend.payments.router.HELEKET_PAYMENT_API_KEY", "test-key"),
            patch("backend.payments.router.process_heleket_webhook_payload") as process,
        ):
            with self.assertRaises(HTTPException) as context:
                await heleket_webhook(FakeRequest(raw), BackgroundTasks())
        self.assertEqual(context.exception.status_code, 400)
        process.assert_not_called()


class HeleketAccountingTests(unittest.TestCase):
    def accounting_patches(self, stored_attempt):
        return (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_attempt_by_provider_order_id",
                return_value=stored_attempt,
            ),
            patch(
                "backend.payments.service.lock_user",
                return_value={"id": 151, "balance": Decimal("10.00")},
            ),
            patch("backend.payments.service.create_balance_transaction", return_value=701),
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_payment_processed"),
            patch("backend.payments.service.set_attempt_status"),
        )

    def test_paid_webhook_credits_local_amount(self):
        patches = self.accounting_patches(heleket_attempt(amount="100.00"))
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload("paid"))

        create_transaction = mocks[3]
        set_balance = mocks[6]
        mark_processed = mocks[7]
        self.assertTrue(credited)
        # Зачисляется ЛОКАЛЬНАЯ сумма, а не payment_amount из webhook.
        self.assertEqual(create_transaction.call_args.kwargs["amount"], Decimal("100.00"))
        self.assertEqual(create_transaction.call_args.kwargs["provider"], "heleket")
        set_balance.assert_called_once_with(
            unittest.mock.ANY,
            user_id=151,
            balance=Decimal("110.00"),
        )
        self.assertEqual(
            mark_processed.call_args.kwargs["credited_amount"],
            Decimal("100.00"),
        )

    def test_duplicate_webhook_does_not_credit_twice(self):
        patches = self.accounting_patches(heleket_attempt(processed=True))
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload())
        self.assertFalse(credited)
        mocks[3].assert_not_called()

    def test_wrong_amount_does_not_credit(self):
        patches = self.accounting_patches(heleket_attempt())
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload("wrong_amount"))
        self.assertFalse(credited)
        mocks[3].assert_not_called()
        mocks[8].assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=501,
            status="wrongamount",
        )

    def test_locked_status_does_not_credit(self):
        patches = self.accounting_patches(heleket_attempt())
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload("locked"))
        self.assertFalse(credited)
        mocks[3].assert_not_called()
        mocks[8].assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=501,
            status="locked",
        )

    def test_intermediate_status_does_not_credit(self):
        patches = self.accounting_patches(heleket_attempt())
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload("process"))
        self.assertFalse(credited)
        mocks[3].assert_not_called()
        mocks[8].assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=501,
            status="pending",
        )

    def test_cancel_status_maps_to_canceled(self):
        patches = self.accounting_patches(heleket_attempt())
        with tuple_context(patches) as mocks:
            credited = process_heleket_webhook_payload(webhook_payload("cancel"))
        self.assertFalse(credited)
        mocks[8].assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=501,
            status="canceled",
        )

    def test_uuid_mismatch_is_rejected(self):
        patches = self.accounting_patches(heleket_attempt())
        payload = {**webhook_payload(), "uuid": "other-uuid"}
        with tuple_context(patches):
            with self.assertRaises(PaymentVerificationError):
                process_heleket_webhook_payload(payload)

    def test_unknown_order_id_is_rejected(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_attempt_by_provider_order_id",
                return_value=None,
            ),
        ):
            with self.assertRaises(PaymentVerificationError):
                process_heleket_webhook_payload(webhook_payload())

    def test_payment_after_cancel_is_credited(self):
        stored = heleket_attempt(status="cancel_requested")
        patches = self.accounting_patches(stored)
        with (
            tuple_context(patches) as mocks,
            patch("backend.payments.service._send_admin_alert_safely") as alert,
        ):
            credited = process_heleket_webhook_payload(webhook_payload())
        self.assertTrue(credited)
        mocks[3].assert_called_once()
        mocks[7].assert_called_once()
        alert.assert_called_once()

    def test_concurrent_webhooks_credit_once(self):
        shared_attempt = heleket_attempt()
        db_lock = threading.Lock()
        transaction_count = 0
        count_lock = threading.Lock()

        def create_transaction(*args, **kwargs):
            nonlocal transaction_count
            with count_lock:
                transaction_count += 1
            return 701

        def mark_processed(*args, **kwargs):
            shared_attempt["processed_at"] = datetime.now(timezone.utc)

        with (
            patch("backend.payments.service.SessionLocal", side_effect=lambda: LockedSession(db_lock)),
            patch(
                "backend.payments.service.get_attempt_by_provider_order_id",
                side_effect=lambda *a, **k: shared_attempt,
            ),
            patch(
                "backend.payments.service.lock_user",
                return_value={"id": 151, "balance": Decimal("10.00")},
            ),
            patch("backend.payments.service.create_balance_transaction", side_effect=create_transaction),
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_payment_processed", side_effect=mark_processed),
        ):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda _: process_heleket_webhook_payload(webhook_payload()),
                    range(2),
                ))

        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(transaction_count, 1)


class HeleketCreateTests(unittest.TestCase):
    def test_create_topup_generates_order_id_and_saves_invoice(self):
        created = {
            **heleket_attempt(amount="100.00"),
            "provider_order_id": None,
            "provider_payment_id": None,
            "confirmation_url": None,
        }
        saved = {
            **created,
            "provider_order_id": "hk_151_abc",
            "provider_payment_id": "heleket-uuid-1",
            "confirmation_url": "https://pay.heleket.com/checkout",
            "status": "pending",
        }
        with (
            patch("backend.payments.service.validate_heleket_configuration"),
            patch("backend.payments.service._create_or_get_topup_attempt", return_value=created),
            patch(
                "backend.payments.service.create_heleket_invoice",
                side_effect=lambda amount, order_id: FakeInvoice(order_id=order_id),
            ) as create_invoice,
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.set_attempt_heleket_details", return_value=saved) as save,
        ):
            result = create_heleket_topup(
                user_id=151,
                amount=Decimal("100.00"),
                idempotence_key="00000000-0000-0000-0000-000000000001",
            )

        self.assertEqual(result["top_up_id"], 501)
        self.assertEqual(result["provider"], "heleket")
        self.assertEqual(result["confirmation_url"], "https://pay.heleket.com/checkout")
        save.assert_called_once()
        order_id = save.call_args.kwargs["provider_order_id"]
        self.assertRegex(order_id, r"^hk_151_[0-9a-f]{32}$")
        create_invoice.assert_called_once_with(
            amount="100.00",
            order_id=order_id,
        )

    def test_existing_invoice_is_returned_without_new_request(self):
        stored = heleket_attempt()
        with (
            patch("backend.payments.service.validate_heleket_configuration"),
            patch("backend.payments.service._create_or_get_topup_attempt", return_value=stored),
            patch("backend.payments.service.create_heleket_invoice") as create_invoice,
        ):
            result = create_heleket_topup(
                user_id=151,
                amount=Decimal("100.00"),
                idempotence_key="00000000-0000-0000-0000-000000000001",
            )
        self.assertEqual(result["top_up_id"], 501)
        create_invoice.assert_not_called()

    def test_invalid_amounts_are_rejected_by_schema(self):
        invalid_amounts = [-100, 0, "abc", None, 10**10, "12.345"]
        for bad in invalid_amounts:
            with self.assertRaises(pydantic.ValidationError):
                CreateHeleketTopUpRequest(
                    amount=bad,
                    idempotence_key=uuid_module.uuid4(),
                )

    def test_valid_amount_is_accepted(self):
        request = CreateHeleketTopUpRequest(
            amount=Decimal("1500.50"),
            idempotence_key=uuid_module.uuid4(),
        )
        self.assertEqual(request.amount, Decimal("1500.50"))


class HeleketOrderTests(unittest.TestCase):
    @staticmethod
    def order_attempt(amount="100.00"):
        return {
            **heleket_attempt(amount=amount),
            "purpose": "order",
            "order_id": 601,
        }

    def test_paid_order_webhook_marks_order_paid(self):
        order = {
            "id": 601,
            "user_id": 151,
            "amount": Decimal("100.00"),
            "status": "Ожидает оплаты",
        }
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_attempt_by_provider_order_id",
                return_value=self.order_attempt(),
            ),
            patch(
                "backend.payments.service.lock_user",
                return_value={"id": 151, "balance": Decimal("10.00")},
            ),
            patch("backend.payments.service.lock_order", return_value=order),
            patch(
                "backend.payments.service.create_balance_transaction",
                return_value=701,
            ) as create_transaction,
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance") as set_balance,
            patch("backend.payments.service.mark_order_paid") as mark_order_paid,
            patch("backend.payments.service.mark_payment_processed"),
        ):
            result = process_heleket_webhook_payload(webhook_payload("paid"))

        self.assertEqual(result, 601)
        mark_order_paid.assert_called_once_with(unittest.mock.ANY, 601)
        self.assertEqual(
            create_transaction.call_args.kwargs["amount"],
            Decimal("100.00"),
        )
        # Баланс: +100 (оплата) − 100 (списание за заказ) = 10.00
        set_balance.assert_called_once_with(
            unittest.mock.ANY,
            user_id=151,
            balance=Decimal("10.00"),
        )

    def test_order_amount_mismatch_is_rejected(self):
        order = {
            "id": 601,
            "user_id": 151,
            "amount": Decimal("999.00"),
            "status": "Ожидает оплаты",
        }
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.get_attempt_by_provider_order_id",
                return_value=self.order_attempt(),
            ),
            patch(
                "backend.payments.service.lock_user",
                return_value={"id": 151, "balance": Decimal("10.00")},
            ),
            patch("backend.payments.service.lock_order", return_value=order),
            patch("backend.payments.service.create_balance_transaction") as create_transaction,
        ):
            with self.assertRaises(PaymentVerificationError):
                process_heleket_webhook_payload(webhook_payload("paid"))
        create_transaction.assert_not_called()

    def test_create_order_payment_creates_invoice(self):
        created = {
            **self.order_attempt(),
            "provider_order_id": None,
            "provider_payment_id": None,
            "confirmation_url": None,
        }
        saved = {
            **created,
            "provider_order_id": "hk_151_abc",
            "provider_payment_id": "heleket-uuid-1",
            "confirmation_url": "https://pay.heleket.com/checkout",
            "status": "pending",
        }
        with (
            patch("backend.payments.service.validate_heleket_configuration"),
            patch("backend.payments.service._prepare_order_attempt", return_value=created),
            patch(
                "backend.payments.service.create_heleket_invoice",
                side_effect=lambda amount, order_id: FakeInvoice(order_id=order_id),
            ) as create_invoice,
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.set_attempt_heleket_details",
                return_value=saved,
            ) as save,
        ):
            result = create_heleket_order_payment(
                user_id=151,
                service_id=1,
                quantity=1,
                recipient_link="https://example.com",
                idempotence_key="00000000-0000-0000-0000-000000000003",
            )

        self.assertEqual(result["order_id"], 601)
        self.assertEqual(result["provider"], "heleket")
        self.assertEqual(result["confirmation_url"], "https://pay.heleket.com/checkout")
        create_invoice.assert_called_once()
        self.assertEqual(
            save.call_args.kwargs["provider_order_id"],
            create_invoice.call_args.kwargs["order_id"],
        )


class HeleketStatusEndpointTests(unittest.TestCase):
    def test_foreign_or_unknown_payment_returns_404(self):
        with (
            patch("backend.payments.router.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.router.get_attempt_by_provider_order_id",
                return_value=None,
            ),
        ):
            with self.assertRaises(HTTPException) as context:
                heleket_payment_status_endpoint(
                    "hk_999_ffff",
                    BackgroundTasks(),
                    {"id": 151},
                )
        self.assertEqual(context.exception.status_code, 404)

    def test_foreign_payment_returns_404_even_when_it_exists(self):
        foreign = {**heleket_attempt(), "user_id": 999}
        with (
            patch("backend.payments.router.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.router.get_attempt_by_provider_order_id",
                return_value=foreign,
            ),
        ):
            with self.assertRaises(HTTPException) as context:
                heleket_payment_status_endpoint(
                    "hk_151_abc",
                    BackgroundTasks(),
                    {"id": 151},
                )
        self.assertEqual(context.exception.status_code, 404)

    def test_own_payment_returns_status(self):
        stored = heleket_attempt(status="pending")
        with (
            patch("backend.payments.router.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.router.get_attempt_by_provider_order_id",
                return_value=stored,
            ),
            patch(
                "backend.payments.router.get_account_summary",
                return_value={"id": 151, "balance": Decimal("10.00")},
            ),
        ):
            result = heleket_payment_status_endpoint(
                "hk_151_abc",
                BackgroundTasks(),
                {"id": 151},
            )
        self.assertEqual(result["order_id"], "hk_151_abc")
        self.assertEqual(result["status"], "pending")
        self.assertFalse(result["credited"])


class tuple_context:
    def __init__(self, patchers):
        self.patchers = patchers
        self.mocks = []

    def __enter__(self):
        self.mocks = [patcher.start() for patcher in self.patchers]
        return self.mocks

    def __exit__(self, exc_type, exc_value, traceback):
        for patcher in reversed(self.patchers):
            patcher.stop()
        return False


if __name__ == "__main__":
    unittest.main()
