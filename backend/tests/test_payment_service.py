import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.payments.service import (
    PaymentConflictError,
    PaymentVerificationError,
    _payment_method_type,
    _validate_idempotent_attempt,
    _validate_payment,
    process_verified_payment,
)
from backend.payments.schemas import CreateOrderRequest
from backend.payments.repository import lock_user


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


def payment(*, amount="100.00", currency="RUB", status="succeeded", method="sbp"):
    return SimpleNamespace(
        id="test-payment-id",
        status=status,
        amount=SimpleNamespace(value=amount, currency=currency),
        metadata={
            "payment_attempt_id": "501",
            "order_id": "601",
            "user_id": "151",
        },
        payment_method=SimpleNamespace(type=method),
        confirmation=None,
    )


def attempt(*, processed=False):
    return {
        "id": 501,
        "order_id": 601,
        "user_id": 151,
        "amount": Decimal("100.00"),
        "currency": "RUB",
        "processed_at": datetime.now(timezone.utc) if processed else None,
    }


class PaymentValidationTests(unittest.TestCase):
    def test_normalizes_recipient_link_without_scheme(self):
        request = CreateOrderRequest(
            service_id=10,
            quantity=1000,
            recipient_link="instagram.com/example",
            payment_method="sbp",
            idempotence_key="00000000-0000-0000-0000-000000000001",
        )
        self.assertEqual(str(request.recipient_link), "https://instagram.com/example")

    def test_request_schema_allows_service_specific_quantity_limits(self):
        request = CreateOrderRequest(
            service_id=10,
            quantity=25,
            recipient_link="https://instagram.com/example",
            payment_method="sbp",
            idempotence_key="00000000-0000-0000-0000-000000000002",
        )
        self.assertEqual(request.quantity, 25)

    def test_accepts_matching_provider_payment(self):
        self.assertEqual(
            _validate_payment(payment(), attempt()),
            Decimal("100.00"),
        )

    def test_reads_sbp_payment_method_from_provider_response(self):
        self.assertEqual(_payment_method_type(payment()), "sbp")
        self.assertEqual(_payment_method_type(payment(method="bank_card")), "bank_card")

    def test_rejects_changed_amount(self):
        with self.assertRaises(PaymentVerificationError):
            _validate_payment(payment(amount="99.99"), attempt())

    def test_rejects_changed_currency(self):
        with self.assertRaises(PaymentVerificationError):
            _validate_payment(payment(currency="USD"), attempt())

    def test_rejects_reused_key_with_changed_order(self):
        stored_attempt = {
            "order_service_id": 10,
            "order_platform": "instagram",
            "order_quantity": 1000,
            "order_link": "https://example.com/original",
            "order_amount": Decimal("100.00"),
        }

        with self.assertRaises(PaymentConflictError):
            _validate_idempotent_attempt(
                stored_attempt,
                service_id=10,
                platform="instagram",
                quantity=2000,
                recipient_link="https://example.com/original",
                amount=Decimal("100.00"),
            )


class PaymentAccountingTests(unittest.TestCase):
    def test_user_balance_lock_uses_postgresql_for_update(self):
        session = MagicMock()
        session.execute.return_value.mappings.return_value.first.return_value = {
            "id": 151,
            "balance": Decimal("100.00"),
        }

        lock_user(session, 151)

        statement = str(session.execute.call_args.args[0]).upper()
        self.assertIn("FOR UPDATE", statement)

    @patch("backend.payments.service.SessionLocal", return_value=FakeSession())
    @patch("backend.payments.service.mark_payment_processed")
    @patch("backend.payments.service.mark_order_paid")
    @patch("backend.payments.service.set_user_balance")
    @patch("backend.payments.service.add_referral_reward")
    @patch("backend.payments.service.create_expense")
    @patch("backend.payments.service.create_balance_transaction", return_value=701)
    @patch("backend.payments.service.lock_order")
    @patch("backend.payments.service.lock_user")
    @patch("backend.payments.service.get_attempt_by_payment_id")
    def test_success_credits_then_debits_without_changing_existing_balance(
        self,
        get_attempt,
        get_user,
        get_order,
        create_transaction,
        create_expense,
        add_referral,
        set_balance,
        mark_order_paid,
        mark_processed,
        _session_local,
    ):
        get_attempt.return_value = attempt()
        get_user.return_value = {"id": 151, "balance": Decimal("25.50")}
        get_order.return_value = {
            "id": 601,
            "user_id": 151,
            "amount": Decimal("100.00"),
            "status": "Ожидает оплаты",
        }

        self.assertEqual(process_verified_payment(payment()), 601)
        create_transaction.assert_called_once()
        self.assertEqual(create_expense.call_count, 2)

        credit = create_expense.call_args_list[0].kwargs
        debit = create_expense.call_args_list[1].kwargs
        self.assertEqual(credit["balance_before"], Decimal("25.50"))
        self.assertEqual(credit["balance_after"], Decimal("125.50"))
        self.assertEqual(credit["amount"], Decimal("100.00"))
        self.assertEqual(credit["expense_type"], 2)
        self.assertEqual(debit["balance_before"], Decimal("125.50"))
        self.assertEqual(debit["balance_after"], Decimal("25.50"))
        self.assertEqual(debit["amount"], Decimal("-100.00"))
        self.assertEqual(debit["expense_type"], 0)
        add_referral.assert_called_once_with(
            unittest.mock.ANY,
            user_id=151,
            reward=Decimal("12.00"),
        )
        set_balance.assert_called_once_with(
            unittest.mock.ANY,
            user_id=151,
            balance=Decimal("25.50"),
        )
        mark_order_paid.assert_called_once()
        mark_processed.assert_called_once()

    @patch("backend.payments.service.SessionLocal", return_value=FakeSession())
    @patch("backend.payments.service.create_balance_transaction")
    @patch("backend.payments.service.get_attempt_by_payment_id")
    def test_duplicate_webhook_does_not_create_second_transaction(
        self,
        get_attempt,
        create_transaction,
        _session_local,
    ):
        get_attempt.return_value = attempt(processed=True)
        self.assertIsNone(process_verified_payment(payment()))
        create_transaction.assert_not_called()


if __name__ == "__main__":
    unittest.main()
