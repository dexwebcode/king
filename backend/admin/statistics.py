"""Сервисный слой статистики: периоды, серии и сводки.

Все агрегаты считаются в PostgreSQL (COUNT/SUM/GROUP BY/date_trunc);
Python занимается только разбором периода и компоновкой ответа.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text

from backend.admin.repository import (
    active_users_count,
    dashboard_snapshot,
    finance_summary,
    revenue_series,
    traffic_series,
    users_baseline,
    users_series,
)
from backend.admin.settings import (
    get_active_users_window_minutes,
    get_markup_percent,
)
from backend.core.database import SessionLocal

MOSCOW = ZoneInfo("Europe/Moscow")

PERIODS = ("today", "7d", "30d", "this_month", "last_month", "custom")


def parse_iso_date(value: date | None) -> date | None:
    return value


def resolve_period(
    period: str,
    date_from: date | None,
    date_to: date | None,
) -> tuple[datetime, datetime, str]:
    """Возвращает (start_ts, end_ts, bucket) в Europe/Moscow.

    bucket: 'hour' для коротких периодов (день, до 2 дней custom),
    иначе 'day'. Чистая функция — тестируется без БД.
    """
    now = datetime.now(MOSCOW)
    today = now.date()

    if period == "custom":
        if date_from is None or date_to is None:
            raise ValueError("Для произвольного периода нужны обе даты")
        if date_to < date_from:
            raise ValueError("Дата окончания раньше даты начала")
        start = datetime.combine(date_from, time.min, tzinfo=MOSCOW)
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=MOSCOW)
        bucket = "hour" if (end - start) <= timedelta(days=2) else "day"
        return start, end, bucket

    if period == "today":
        start = datetime.combine(today, time.min, tzinfo=MOSCOW)
        end = start + timedelta(days=1)
        return start, end, "hour"

    if period == "7d":
        start = datetime.combine(today - timedelta(days=6), time.min, tzinfo=MOSCOW)
        end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=MOSCOW)
        return start, end, "day"

    if period == "30d":
        start = datetime.combine(today - timedelta(days=29), time.min, tzinfo=MOSCOW)
        end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=MOSCOW)
        return start, end, "day"

    if period == "this_month":
        start = datetime.combine(today.replace(day=1), time.min, tzinfo=MOSCOW)
        if today.month == 12:
            next_month = today.replace(year=today.year + 1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month + 1, day=1)
        end = datetime.combine(next_month, time.min, tzinfo=MOSCOW)
        return start, end, "day"

    if period == "last_month":
        first_of_this = today.replace(day=1)
        start = datetime.combine(
            (first_of_this - timedelta(days=1)).replace(day=1),
            time.min,
            tzinfo=MOSCOW,
        )
        end = datetime.combine(first_of_this, time.min, tzinfo=MOSCOW)
        return start, end, "day"

    raise ValueError(f"Неизвестный период: {period}")


def range_bounds(date_from: date | None, date_to: date | None):
    """Границы для списков заказов: день начала и день после конца."""
    if date_from is None and date_to is None:
        return None, None
    start = (
        datetime.combine(date_from, time.min, tzinfo=MOSCOW)
        if date_from is not None
        else None
    )
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=MOSCOW)
        if date_to is not None
        else None
    )
    return start, end


def _compose_series(period: str, date_from, date_to, fetcher) -> dict:
    start, end, bucket = resolve_period(period, date_from, date_to)
    session = SessionLocal()
    try:
        series = fetcher(session, start_ts=start, end_ts=end, bucket=bucket)
    finally:
        session.close()
    return {
        "period": period,
        "bucket": bucket,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "series": series,
    }


def get_revenue_stats(period: str, date_from: date | None, date_to: date | None) -> dict:
    return _compose_series(period, date_from, date_to, revenue_series)


def get_users_stats(period: str, date_from: date | None, date_to: date | None) -> dict:
    start, end, bucket = resolve_period(period, date_from, date_to)
    session = SessionLocal()
    try:
        series = users_series(session, start_ts=start, end_ts=end, bucket=bucket)
        baseline = users_baseline(session, start)
        active = active_users_count(
            session, window_minutes=get_active_users_window_minutes()
        )
        total_users = int(
            session.execute(
                text("SELECT COUNT(*) FROM migration_temp.users")
            ).scalar_one()
        )
    finally:
        session.close()

    # Кумулятивная динамика: baseline до периода + регистрации по корзинам.
    cumulative = baseline
    for item in series:
        cumulative += item["registrations"]
        item["total_users"] = cumulative

    return {
        "period": period,
        "bucket": bucket,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "series": series,
        "baseline_before_period": baseline,
        "active_users": active,
        "total_users": total_users,
    }


def get_traffic_stats(period: str, date_from: date | None, date_to: date | None) -> dict:
    return _compose_series(period, date_from, date_to, traffic_series)


def get_finance_summary(period: str, date_from: date | None, date_to: date | None) -> dict:
    start, end, _ = resolve_period(period, date_from, date_to)
    session = SessionLocal()
    try:
        summary = finance_summary(session, start_ts=start, end_ts=end)
    finally:
        session.close()
    return {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        **summary,
    }


def get_dashboard_payload() -> dict:
    window_minutes = get_active_users_window_minutes()
    session = SessionLocal()
    try:
        snapshot = dashboard_snapshot(
            session, active_window_minutes=window_minutes
        )
    finally:
        session.close()
    return {
        **snapshot,
        "markup_percent": str(get_markup_percent()),
        "active_users_window_minutes": window_minutes,
    }
