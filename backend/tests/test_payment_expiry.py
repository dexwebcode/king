import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.payments.service import (
    _format_expires_at,
    _invoice_expires_at,
    _payment_response,
    _topup_response,
    create_crystalpay_topup,
    create_heleket_order_payment,
    create_order_payment,
)


UTC = timezone.utc


def dt(y, mo, d, h, mi):
    return datetime(y, mo, d, h, mi, tzinfo=UTC)


class FakeSession:
    def begin(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def close(self):
        pass


class PaymentExpiryHelpersTest(unittest.TestCase):
    def test_fallback_uses_payment_timeout_minutes(self):
        created = dt(2024, 1, 1, 12, 0)
        self.assertEqual(
            _invoice_expires_at(created), created + timedelta(minutes=15)
        )

    def test_uses_provider_int_timestamp(self):
        created = dt(2024, 1, 1, 12, 0)
        ts = int((created + timedelta(minutes=10)).timestamp())
        self.assertEqual(
            _invoice_expires_at(created, ts), created + timedelta(minutes=10)
        )

    def test_uses_provider_iso_string(self):
        created = dt(2024, 1, 1, 12, 0)
        self.assertEqual(
            _invoice_expires_at(created, "2024-01-01T12:05:00Z"),
            dt(2024, 1, 1, 12, 5),
        )

    def test_response_builders_include_expires_at(self):
        attempt = {
            "id": 501,
            "order_id": 10,
            "provider_payment_id": "p1",
            "confirmation_url": "https://x",
            "status": "pending",
            "provider": "crystalpay",
            "expires_at": dt(2024, 1, 1, 12, 15),
        }
        self.assertEqual(
            _payment_response(attempt)["expires_at"], "2024-01-01T12:15:00.000Z"
        )
        self.assertEqual(
            _topup_response(attempt)["expires_at"], "2024-01-01T12:15:00.000Z"
        )

    def test_missing_expires_at_is_none(self):
        attempt = {
            "id": 501,
            "order_id": 10,
            "confirmation_url": "https://x",
            "status": "pending",
        }
        self.assertIsNone(_payment_response(attempt)["expires_at"])


class PaymentExpiryFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_crystalpay_topup_passes_expires_at(self):
        created = {
            "id": 501,
            "user_id": 151,
            "order_id": None,
            "amount": Decimal("100.00"),
            "created_at": dt(2024, 1, 1, 12, 0),
            "provider_payment_id": None,
            "confirmation_url": None,
            "processed_at": None,
            "status": "pending",
            "provider": "crystalpay",
        }
        saved = {
            **created,
            "provider_payment_id": "invoice-1",
            "confirmation_url": "https://pay.crystalpay.io/invoice-1",
            "status": "created",
            "expires_at": dt(2024, 1, 1, 12, 15),
        }
        with (
            patch("backend.payments.service.validate_crystalpay_configuration"),
            patch(
                "backend.payments.service._create_or_get_topup_attempt",
                return_value=created,
            ),
            patch(
                "backend.payments.service._claim_crystalpay_invoice_creation",
                return_value=created,
            ),
            patch(
                "backend.payments.service.crystalpay_client.create_invoice",
                new=AsyncMock(return_value={
                    "id": "invoice-1",
                    "url": "https://pay.crystalpay.io/invoice-1",
                    "type": "topup",
                    "currency": "RUB",
                }),
            ),
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.set_attempt_payment_details",
                return_value=saved,
            ) as save,
        ):
            result = await create_crystalpay_topup(
                user_id=151,
                amount=Decimal("100.00"),
                idempotence_key="00000000-0000-0000-0000-000000000001",
            )

        self.assertEqual(result["expires_at"], "2024-01-01T12:15:00.000Z")
        # CrystalPay не вернул expire_at → fallback created_at + 15 мин.
        self.assertEqual(save.call_args.kwargs["expires_at"], dt(2024, 1, 1, 12, 15))

    def test_heleket_order_uses_provider_expired_at(self):
        created = {
            "id": 501,
            "user_id": 151,
            "order_id": 601,
            "amount": Decimal("100.00"),
            "created_at": dt(2024, 1, 1, 12, 0),
            "provider_order_id": None,
            "provider_payment_id": None,
            "confirmation_url": None,
            "processed_at": None,
            "status": "pending",
            "provider": "heleket",
            "purpose": "order",
        }
        saved = {
            **created,
            "provider_order_id": "hk_151_abc",
            "provider_payment_id": "heleket-uuid-1",
            "confirmation_url": "https://pay.heleket.com/checkout",
            "status": "pending",
            "expires_at": dt(2024, 1, 1, 12, 10),
        }

        class FakeInvoice:
            def __init__(self, order_id):
                self.uuid = "heleket-uuid-1"
                self.url = "https://pay.heleket.com/checkout"
                self.order_id = order_id
                self.amount = "100.00"
                self.expired_at = int((dt(2024, 1, 1, 12, 10)).timestamp())

        with (
            patch("backend.payments.service.validate_heleket_configuration"),
            patch(
                "backend.payments.service._prepare_order_attempt",
                return_value=created,
            ),
            patch(
                "backend.payments.service.create_heleket_invoice",
                side_effect=lambda amount, order_id: FakeInvoice(order_id),
            ),
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

        self.assertEqual(result["expires_at"], "2024-01-01T12:10:00.000Z")
        # Heleket вернул expired_at (unix ts) → используется он, а не fallback.
        self.assertEqual(save.call_args.kwargs["expires_at"], dt(2024, 1, 1, 12, 10))

    def test_yookassa_order_passes_provider_expires_at(self):
        created = {
            "id": 501,
            "user_id": 151,
            "order_id": 601,
            "amount": Decimal("150.00"),
            "created_at": dt(2024, 1, 1, 12, 0),
            "provider_payment_id": None,
            "confirmation_url": None,
            "processed_at": None,
            "status": "pending",
            "provider": "yookassa",
        }
        saved = {
            **created,
            "provider_payment_id": "pay-1",
            "confirmation_url": "https://yoomoney.ru/checkout/pay-1",
            "status": "pending",
            "expires_at": dt(2024, 1, 1, 12, 5),
        }
        payment = SimpleNamespace(
            id="pay-1",
            status="pending",
            expires_at="2024-01-01T12:05:00Z",
            payment_method=SimpleNamespace(type="sbp"),
            confirmation=SimpleNamespace(
                confirmation_url="https://yoomoney.ru/checkout/pay-1"
            ),
        )
        with (
            patch(
                "backend.payments.service._prepare_order_attempt",
                return_value=created,
            ),
            patch(
                "backend.payments.service.create_yookassa_payment",
                return_value=payment,
            ),
            patch("backend.payments.service.SessionLocal", return_value=FakeSession()),
            patch(
                "backend.payments.service.set_attempt_payment_details",
                return_value=saved,
            ) as save,
        ):
            result = create_order_payment(
                user_id=151,
                service_id=1,
                quantity=1,
                recipient_link="https://example.com",
                payment_method="sbp",
                idempotence_key="00000000-0000-0000-0000-000000000004",
            )

        self.assertEqual(result["expires_at"], "2024-01-01T12:05:00.000Z")
        self.assertEqual(save.call_args.kwargs["expires_at"], dt(2024, 1, 1, 12, 5))


if __name__ == "__main__":
    unittest.main()
