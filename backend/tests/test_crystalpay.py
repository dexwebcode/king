import hashlib
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from unittest.mock import AsyncMock, patch

from fastapi import BackgroundTasks, HTTPException

from backend.payments.crystalpay_service import (
    CrystalPayAPIError,
    CrystalPayClient,
    verify_callback_signature,
)
from backend.payments.router import crystalpay_callback
from backend.payments.service import (
    PaymentVerificationError,
    create_crystalpay_order_payment,
    create_crystalpay_topup,
    process_crystalpay_invoice,
    reconcile_crystalpay_invoice_if_due,
)


class FakeRequest:
    def __init__(self, payload):
        self.payload = payload

    async def body(self):
        return json.dumps(self.payload).encode("utf-8")


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


class FakeResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False

    async def json(self, content_type=None):
        return self.payload


class FakeHTTPClient:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False

    def post(self, *args, **kwargs):
        if self.error:
            raise self.error
        return self.response


def attempt(*, processed=False, amount="100.00"):
    return {
        "id": 501,
        "provider": "crystalpay",
        "provider_payment_id": "invoice-1",
        "confirmation_url": "https://pay.crystalpay.io/invoice-1",
        "user_id": 151,
        "order_id": None,
        "amount": Decimal(amount),
        "currency": "RUB",
        "purpose": "balance_topup",
        "status": "created",
        "processed_at": datetime.now(timezone.utc) if processed else None,
    }


def invoice(*, state="payed", amount="125.50", rub_amount=None, extra="501", amount_currency="RUB"):
    """Ответ CrystalPAY: `amount` — точная сумма, `rub_amount` — целые рубли.

    Провайдер всегда отдаёт `rub_amount` округлённым до рубля, поэтому
    заглушка по умолчанию выводит его из точной суммы, как это делает он сам.
    """
    if rub_amount is None:
        rub_amount = str(Decimal(amount).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return {
        "error": False,
        "errors": [],
        "id": "invoice-1",
        "state": state,
        "type": "topup",
        "currency": "RUB",
        "amount_currency": amount_currency,
        "rub_amount": rub_amount,
        "amount": amount,
        "extra": extra,
    }


class CrystalPayClientTests(unittest.IsolatedAsyncioTestCase):
    @patch("backend.payments.crystalpay_service.validate_crystalpay_configuration")
    async def test_http_200_with_error_true_is_rejected(self, _validate):
        response = FakeResponse({"error": True, "errors": ["invalid amount"]})
        with patch(
            "backend.payments.crystalpay_service.aiohttp.ClientSession",
            return_value=FakeHTTPClient(response=response),
        ):
            with self.assertRaises(CrystalPayAPIError):
                await CrystalPayClient().get_invoice("invoice-1")

    @patch("backend.payments.crystalpay_service.validate_crystalpay_configuration")
    async def test_timeout_is_mapped_to_provider_error(self, _validate):
        with patch(
            "backend.payments.crystalpay_service.aiohttp.ClientSession",
            return_value=FakeHTTPClient(error=TimeoutError()),
        ):
            with self.assertRaises(CrystalPayAPIError):
                await CrystalPayClient().get_invoice("invoice-1")

    async def test_successful_invoice_creation_is_saved(self):
        created = {
            **attempt(),
            "provider_payment_id": None,
            "confirmation_url": None,
        }
        saved = {**created, "provider_payment_id": "invoice-1", "confirmation_url": "https://pay.crystalpay.io/invoice-1", "status": "created"}
        with (
            patch("backend.payments.service.validate_crystalpay_configuration"),
            patch("backend.payments.service._create_or_get_topup_attempt", return_value=created),
            patch(
                "backend.payments.service.crystalpay_client.create_invoice",
                new=AsyncMock(return_value={
                    "error": False,
                    "errors": [],
                    "id": "invoice-1",
                    "url": "https://pay.crystalpay.io/invoice-1",
                    "type": "topup",
                    "currency": "RUB",
                }),
            ),
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.set_attempt_payment_details", return_value=saved) as save,
        ):
            result = await create_crystalpay_topup(
                user_id=151,
                amount=Decimal("100.00"),
                idempotence_key="00000000-0000-0000-0000-000000000001",
            )

        self.assertEqual(result["top_up_id"], 501)
        self.assertEqual(result["attempt_id"], 501)
        self.assertEqual(result["payment_id"], "invoice-1")
        self.assertEqual(result["confirmation_url"], "https://pay.crystalpay.io/invoice-1")
        save.assert_called_once()


    async def test_order_invoice_with_kopecks_is_created(self):
        created = {
            **attempt(amount="6114.13"),
            "provider_payment_id": None,
            "confirmation_url": None,
        }
        saved = {
            **created,
            "provider_payment_id": "invoice-kopeck",
            "confirmation_url": "https://pay.crystalpay.io/?i=invoice-kopeck",
            "status": "created",
        }
        with (
            patch("backend.payments.service.validate_crystalpay_configuration"),
            patch("backend.payments.service._prepare_order_attempt", return_value=created),
            patch(
                "backend.payments.service.crystalpay_client.create_invoice",
                new=AsyncMock(return_value={
                    "error": False,
                    "errors": [],
                    "id": "invoice-kopeck",
                    "url": "https://pay.crystalpay.io/?i=invoice-kopeck",
                    "type": "purchase",
                    "currency": "RUB",
                    "amount_currency": "RUB",
                    "amount": "6114.13",
                    "rub_amount": "6114",
                }),
            ),
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.set_attempt_payment_details", return_value=saved),
        ):
            result = await create_crystalpay_order_payment(
                user_id=151,
                service_id=1,
                quantity=1,
                recipient_link="https://example.com",
                idempotence_key="00000000-0000-0000-0000-000000000002",
            )

        self.assertEqual(result["confirmation_url"], "https://pay.crystalpay.io/?i=invoice-kopeck")
        self.assertEqual(result["status"], "created")


class CrystalPayCallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_signature_is_rejected_without_api_request(self):
        with (
            patch("backend.payments.router.validate_crystalpay_configuration"),
            patch("backend.payments.router.verify_callback_signature", return_value=False),
            patch(
                "backend.payments.router.crystalpay_client.get_invoice",
                new=AsyncMock(),
            ) as get_invoice,
        ):
            with self.assertRaises(HTTPException) as context:
                await crystalpay_callback(FakeRequest({
                    "id": "invoice-1",
                    "signature": "invalid",
                }), BackgroundTasks())
        self.assertEqual(context.exception.status_code, 401)
        get_invoice.assert_not_awaited()

    async def test_valid_callback_verifies_invoice_server_side(self):
        verified = invoice()
        with (
            patch("backend.payments.router.validate_crystalpay_configuration"),
            patch("backend.payments.router.verify_callback_signature", return_value=True),
            patch(
                "backend.payments.router.crystalpay_client.get_invoice",
                new=AsyncMock(return_value=verified),
            ) as get_invoice,
            patch("backend.payments.router.process_crystalpay_invoice", return_value=True) as process,
        ):
            response = await crystalpay_callback(FakeRequest({
                "id": "invoice-1",
                "signature": "valid",
                "rub_amount": "999999.00",
            }), BackgroundTasks())
        self.assertEqual(response, {"status": "ok", "credited": True})
        get_invoice.assert_awaited_once_with("invoice-1")
        process.assert_called_once_with("invoice-1", verified)

    def test_signature_uses_sha1_and_constant_time_helper(self):
        salt = "test-salt"
        expected = hashlib.sha1(f"invoice-1:{salt}".encode()).hexdigest()
        with patch("backend.payments.crystalpay_service.CRYSTALPAY_SALT", salt):
            self.assertTrue(verify_callback_signature("invoice-1", expected))
            self.assertFalse(verify_callback_signature("invoice-1", "bad"))


class CrystalPayReconciliationTests(unittest.IsolatedAsyncioTestCase):
    async def test_pending_invoice_is_verified_via_provider_api(self):
        verified = invoice()
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_payment_reconciliation", return_value=True) as claim,
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(return_value=verified),
            ) as get_invoice,
            patch("backend.payments.service.process_crystalpay_invoice") as process,
        ):
            await reconcile_crystalpay_invoice_if_due("invoice-1")

        claim.assert_called_once_with(
            unittest.mock.ANY,
            "invoice-1",
            provider="crystalpay",
        )
        get_invoice.assert_awaited_once_with("invoice-1")
        process.assert_called_once_with("invoice-1", verified)

    async def test_recent_reconciliation_is_not_repeated(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.claim_payment_reconciliation", return_value=False),
            patch(
                "backend.payments.service.crystalpay_client.get_invoice",
                new=AsyncMock(),
            ) as get_invoice,
        ):
            await reconcile_crystalpay_invoice_if_due("invoice-1")

        get_invoice.assert_not_awaited()


class CrystalPayAccountingTests(unittest.TestCase):
    def accounting_patches(self, stored_attempt):
        return (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_attempt_by_payment_id", return_value=stored_attempt),
            patch("backend.payments.service.lock_user", return_value={"id": 151, "balance": Decimal("10.00")}),
            patch("backend.payments.service.create_balance_transaction", return_value=701),
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_payment_processed"),
            patch("backend.payments.service.set_attempt_status"),
        )

    def test_payed_topup_credits_exact_invoice_amount(self):
        patches = self.accounting_patches(attempt(amount="100.00"))
        with tuple_context(patches) as mocks:
            credited = process_crystalpay_invoice("invoice-1", invoice(amount="125.50"))

        create_transaction = mocks[3]
        set_balance = mocks[6]
        mark_processed = mocks[7]
        self.assertTrue(credited)
        self.assertEqual(create_transaction.call_args.kwargs["amount"], Decimal("125.50"))
        self.assertEqual(create_transaction.call_args.kwargs["provider"], "crystalpay")
        set_balance.assert_called_once_with(
            unittest.mock.ANY,
            user_id=151,
            balance=Decimal("135.50"),
        )
        self.assertEqual(mark_processed.call_args.kwargs["credited_amount"], Decimal("125.50"))

    def test_non_payed_invoice_does_not_credit_balance(self):
        patches = self.accounting_patches(attempt())
        with tuple_context(patches) as mocks:
            credited = process_crystalpay_invoice("invoice-1", invoice(state="wrongamount"))
        self.assertFalse(credited)
        mocks[3].assert_not_called()
        mocks[8].assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=501,
            status="wrongamount",
        )

    def test_duplicate_callback_does_not_credit_twice(self):
        patches = self.accounting_patches(attempt(processed=True))
        with tuple_context(patches) as mocks:
            credited = process_crystalpay_invoice("invoice-1", invoice())
        self.assertFalse(credited)
        mocks[3].assert_not_called()

    def test_unknown_invoice_is_rejected(self):
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_attempt_by_payment_id", return_value=None),
        ):
            with self.assertRaises(PaymentVerificationError):
                process_crystalpay_invoice("invoice-1", invoice())

    def test_concurrent_callbacks_credit_once(self):
        shared_attempt = attempt()
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
            patch("backend.payments.service.get_attempt_by_payment_id", side_effect=lambda *a, **k: shared_attempt),
            patch("backend.payments.service.lock_user", return_value={"id": 151, "balance": Decimal("10.00")}),
            patch("backend.payments.service.create_balance_transaction", side_effect=create_transaction),
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_payment_processed", side_effect=mark_processed),
        ):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda _: process_crystalpay_invoice("invoice-1", invoice()),
                    range(2),
                ))

        self.assertEqual(sorted(results), [False, True])
        self.assertEqual(transaction_count, 1)


class CrystalPayOrderAndCancellationTests(unittest.TestCase):
    def test_payed_purchase_marks_order_paid(self):
        stored_attempt = {
            **attempt(amount="100.00"),
            "purpose": "order",
            "order_id": 601,
        }
        purchase_invoice = {
            **invoice(amount="100.00"),
            "type": "purchase",
        }
        order = {
            "id": 601,
            "user_id": 151,
            "amount": Decimal("100.00"),
            "status": "Ожидает оплаты",
        }
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_attempt_by_payment_id", return_value=stored_attempt),
            patch("backend.payments.service.lock_user", return_value={"id": 151, "balance": Decimal("10.00")}),
            patch("backend.payments.service.lock_order", return_value=order),
            patch("backend.payments.service.create_balance_transaction", return_value=701),
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_order_paid") as mark_order_paid,
            patch("backend.payments.service.mark_payment_processed") as mark_processed,
        ):
            result = process_crystalpay_invoice("invoice-1", purchase_invoice)

        self.assertEqual(result, 601)
        mark_order_paid.assert_called_once_with(unittest.mock.ANY, 601)
        mark_processed.assert_called_once()

    def test_payed_invoice_after_cancel_is_not_processed(self):
        stored_attempt = {**attempt(), "status": "cancel_requested"}
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_attempt_by_payment_id", return_value=stored_attempt),
            patch("backend.payments.service.mark_payment_paid_after_cancel") as late_payment,
            patch("backend.payments.service.create_balance_transaction") as create_transaction,
        ):
            result = process_crystalpay_invoice("invoice-1", invoice())

        self.assertFalse(result)
        late_payment.assert_called_once_with(unittest.mock.ANY, 501)
        create_transaction.assert_not_called()


    def test_payed_purchase_with_kopecks_credits_exact_amount(self):
        stored_attempt = {
            **attempt(amount="392.32"),
            "purpose": "order",
            "order_id": 601,
        }
        purchase_invoice = {
            **invoice(amount="392.32", amount_currency="BTC"),
            "type": "purchase",
        }
        order = {
            "id": 601,
            "user_id": 151,
            "amount": Decimal("392.32"),
            "status": "Ожидает оплаты",
        }
        with (
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch("backend.payments.service.get_attempt_by_payment_id", return_value=stored_attempt),
            patch("backend.payments.service.lock_user", return_value={"id": 151, "balance": Decimal("10.00")}),
            patch("backend.payments.service.lock_order", return_value=order),
            patch("backend.payments.service.create_balance_transaction", return_value=701) as create_transaction,
            patch("backend.payments.service.create_expense"),
            patch("backend.payments.service.add_referral_reward"),
            patch("backend.payments.service.set_user_balance"),
            patch("backend.payments.service.mark_order_paid") as mark_order_paid,
            patch("backend.payments.service.mark_payment_processed"),
        ):
            result = process_crystalpay_invoice("invoice-1", purchase_invoice)

        self.assertEqual(result, 601)
        self.assertEqual(create_transaction.call_args.kwargs["amount"], Decimal("392.32"))
        mark_order_paid.assert_called_once_with(unittest.mock.ANY, 601)


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
