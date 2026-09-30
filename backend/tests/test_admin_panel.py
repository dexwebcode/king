"""Тесты административной панели (без БД — чистые функции и схемы).

Интеграционные проверки endpoint'ов выполняются вручную на реальной БД,
по аналогии с *_TEST_DATABASE_URL-сценариями других модулей.
"""

import unittest
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from pydantic import ValidationError

from backend.admin.audit import sanitize_audit_value
from backend.admin.schemas import (
    BanUserRequest,
    MarkupUpdateRequest,
    OrderStatusUpdateRequest,
)
from backend.admin.settings import (
    ACTIVE_WINDOW_MAX_MINUTES,
    MARKUP_MAX,
    MARKUP_MIN,
    parse_active_window_value,
    parse_markup_value,
)
from backend.admin.statistics import resolve_period
from backend.admin.service import (
    MANUAL_STATUS_TARGETS,
    _order_is_paid,
)
from backend.analytics.schemas import TrackEventRequest
from backend.analytics.service import hash_visitor


class PeriodResolutionTests(unittest.TestCase):
    def test_presets_are_ordered_and_non_empty(self):
        for period in ("today", "7d", "30d", "this_month", "last_month"):
            start, end, bucket = resolve_period(period, None, None)
            self.assertLess(start, end)
            self.assertIn(bucket, ("hour", "day"))

    def test_today_uses_hour_buckets(self):
        _, _, bucket = resolve_period("today", None, None)
        self.assertEqual(bucket, "hour")

    def test_week_and_month_use_day_buckets(self):
        for period in ("7d", "30d", "this_month", "last_month"):
            _, _, bucket = resolve_period(period, None, None)
            self.assertEqual(bucket, "day")

    def test_custom_requires_both_dates(self):
        with self.assertRaises(ValueError):
            resolve_period("custom", date(2026, 1, 1), None)
        with self.assertRaises(ValueError):
            resolve_period("custom", None, date(2026, 1, 1))

    def test_custom_rejects_inverted_range(self):
        with self.assertRaises(ValueError):
            resolve_period("custom", date(2026, 2, 1), date(2026, 1, 1))

    def test_custom_range_is_inclusive_and_bucket_sane(self):
        start, end, bucket = resolve_period(
            "custom", date(2026, 6, 1), date(2026, 6, 30)
        )
        self.assertEqual((end - start).days, 30)
        self.assertEqual(bucket, "day")
        start2, end2, bucket2 = resolve_period(
            "custom", date(2026, 6, 1), date(2026, 6, 1)
        )
        self.assertEqual((end2 - start2), timedelta(days=1))
        self.assertEqual(bucket2, "hour")


class MarkupSettingsTests(unittest.TestCase):
    def test_valid_values(self):
        self.assertEqual(parse_markup_value("35"), Decimal("35.00"))
        self.assertEqual(parse_markup_value(Decimal("12.5")), Decimal("12.50"))
        self.assertEqual(parse_markup_value(" 20 "), Decimal("20.00"))

    def test_bounds(self):
        self.assertEqual(parse_markup_value("0"), MARKUP_MIN)
        self.assertEqual(parse_markup_value("1000"), MARKUP_MAX)
        for bad in ("-1", "1000.01", "abc", "", None, "inf", "nan"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_markup_value(bad)


class ActiveWindowSettingsTests(unittest.TestCase):
    def test_valid_values(self):
        self.assertEqual(parse_active_window_value("30"), 30)
        self.assertEqual(parse_active_window_value(60), 60)

    def test_invalid_values(self):
        for bad in ("0", "4", "-5", "abc", "", str(ACTIVE_WINDOW_MAX_MINUTES + 1)):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_active_window_value(bad)


class VisitorHashingTests(unittest.TestCase):
    def test_deterministic(self):
        first = hash_visitor("visitor-abc-123456")
        second = hash_visitor("visitor-abc-123456")
        self.assertEqual(first, second)
        self.assertEqual(len(first), 48)

    def test_different_visitors_differ(self):
        self.assertNotEqual(
            hash_visitor("visitor-aaa-111111"),
            hash_visitor("visitor-bbb-222222"),
        )

    def test_original_id_not_recoverable(self):
        digest = hash_visitor("visitor-abc-123456")
        self.assertNotIn("visitor-abc-123456", digest)


class TrackEventSchemaTests(unittest.TestCase):
    def test_valid_event(self):
        event = TrackEventRequest(visitor_id="v-12345678", path="/catalog")
        self.assertEqual(event.path, "/catalog")

    def test_query_string_stripped_from_path(self):
        event = TrackEventRequest(
            visitor_id="v-12345678", path="/catalog?section=balance#top"
        )
        self.assertEqual(event.path, "/catalog")

    def test_invalid_events(self):
        invalid = [
            {"visitor_id": "short", "path": "/"},
            {"visitor_id": "v-12345678", "event_type": "mousemove"},
            {"visitor_id": "v-12345678", "path": "x" * 301},
        ]
        for payload in invalid:
            with self.subTest(payload=str(payload)[:60]), self.assertRaises(ValidationError):
                TrackEventRequest(**payload)


class AdminSchemaTests(unittest.TestCase):
    def test_ban_reason_trimmed(self):
        self.assertIsNone(BanUserRequest(reason="   ").reason)
        self.assertEqual(
            BanUserRequest(reason="  спам  ").reason, "спам"
        )

    def test_markup_request(self):
        self.assertEqual(MarkupUpdateRequest(value="35").value, Decimal("35"))

    def test_order_status_request(self):
        self.assertEqual(
            OrderStatusUpdateRequest(status="  Отменен  ").status, "Отменен"
        )
        with self.assertRaises(ValidationError):
            OrderStatusUpdateRequest(status="")


class AuditSanitizeTests(unittest.TestCase):
    def test_none(self):
        self.assertIsNone(sanitize_audit_value(None))

    def test_newlines_replaced_and_truncated(self):
        value = "строка\nс\nпереводами" + "x" * 3000
        result = sanitize_audit_value(value)
        self.assertEqual(len(result), 2000)
        self.assertNotIn("\n", result)
        self.assertNotIn("\r", result)


class OrderStatusGuardTests(unittest.TestCase):
    def test_allowed_targets(self):
        for status in ("Ожидает отправки", "Отменен", "Требует проверки", "Отклонен поставщиком"):
            self.assertIn(status, MANUAL_STATUS_TARGETS)

    def test_paid_detection_with_processed_attempt(self):
        order = {"payment_attempt_id": 10, "payment_status": "processed", "status": "Отправляется"}
        self.assertTrue(_order_is_paid(order))

    def test_unpaid_detection_with_unprocessed_attempt(self):
        order = {"payment_attempt_id": 10, "payment_status": "creating", "status": "Ожидает оплаты"}
        self.assertFalse(_order_is_paid(order))

    def test_legacy_unpaid_statuses_are_not_paid(self):
        for status in ("Ожидает оплаты", "Оплата отменена"):
            order = {"payment_attempt_id": None, "status": status}
            self.assertFalse(_order_is_paid(order), status)

    def test_legacy_paid_status_is_paid(self):
        order = {"payment_attempt_id": None, "status": "Готово"}
        self.assertTrue(_order_is_paid(order))


class MarkupFallbackTests(unittest.TestCase):
    def test_fallback_to_env_without_db(self):
        from backend.services import get_price

        with patch.object(get_price, "_markup_settings", False):
            value = get_price.current_markup_percent()
        self.assertGreaterEqual(value, Decimal("0"))

    def test_add_markup_uses_configured_value(self):
        from backend.services import get_price

        with patch.object(get_price, "_markup_settings", False):
            service = get_price.add_markup_to_service({"rate": "100.00"})
        self.assertEqual(service["rate"], "150.00")  # env fallback = 50%


if __name__ == "__main__":
    unittest.main()
