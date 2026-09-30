"""Административное API: /api/admin/*.

Все эндпоинты защищены зависимостью get_current_admin (JWT + allowlist
ADMIN_USER_IDS из backend/.env): обычный пользователь получает 403
даже при прямом запросе. Данные читаются из существующих таблиц
PostgreSQL; внешние/моковые значения не подставляются.
"""

import logging
from datetime import date
from typing import Literal
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.admin.audit import record_audit
from backend.admin.schemas import (
    ActiveWindowUpdateRequest,
    BanUserRequest,
    MarkupUpdateRequest,
    OrderStatusUpdateRequest,
)
from backend.admin.settings import (
    get_active_users_window_minutes,
    get_markup_percent,
    set_active_users_window_minutes,
    set_markup_percent,
)
from backend.auth.repository import count_legacy_password_hashes
from backend.core import config
from backend.core.config import ALLOW_LEGACY_MD5_LOGIN
from backend.core.database import SessionLocal
from backend.payments.service import (
    DispatchResolutionError,
    OrderNotFoundError,
    RetryDispatchError,
    resolve_dispatch_order,
)
from backend.services.supplier import (
    SupplierNotConfiguredError,
    SupplierRejectedError,
    SupplierResponseError,
)

from . import repository, statistics
from .dependencies import get_current_admin
from .service import (
    OrderStatusChangeError,
    change_order_status_manual,
    get_admin_supplier_balance,
    list_supplier_attention_orders,
    retry_blocked_order,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin",
    tags=["Администрирование"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("/me")
def admin_identity_endpoint():
    return {"success": True, "is_admin": True}


@router.get("/auth/legacy-password-hashes")
def legacy_password_hashes_endpoint():
    """Число аккаунтов со старым MD5-хешем пароля (для миграции)."""
    session = SessionLocal()
    try:
        count = count_legacy_password_hashes(session)
    finally:
        session.close()
    return {"success": True, "count": count, "md5_login_allowed": ALLOW_LEGACY_MD5_LOGIN}


def _supplier_unavailable(error: Exception) -> HTTPException:
    logger.warning("Admin supplier request failed error_type=%s", type(error).__name__)
    if isinstance(error, SupplierNotConfiguredError):
        return HTTPException(status_code=503, detail="Поставщик не настроен")
    if isinstance(error, SupplierRejectedError):
        return HTTPException(status_code=502, detail=str(error))
    return HTTPException(status_code=502, detail="Поставщик временно недоступен")


@router.get("/supplier/balance")
def supplier_balance_endpoint(
    refresh: bool = Query(default=False),
):
    try:
        balance, checked_at = get_admin_supplier_balance(force_refresh=refresh)
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
    ) as error:
        raise _supplier_unavailable(error) from error
    return {
        "success": True,
        "balance": format(balance.balance, "f"),
        "currency": balance.currency,
        "checked_at": checked_at.isoformat(),
    }


@router.get("/orders/blocked")
def blocked_orders_endpoint():
    items = list_supplier_attention_orders()
    return {
        "success": True,
        "items": [
            item
            for item in items
            if item["dispatch_status"] == "insufficient_supplier_balance"
        ],
    }


@router.get("/orders/attention")
def attention_orders_endpoint():
    return {"success": True, "items": list_supplier_attention_orders()}


@router.post("/orders/{order_id}/retry-dispatch")
def retry_dispatch_endpoint(
    order_id: int,
    current_user: dict = Depends(get_current_admin),
):
    try:
        dispatch_status = retry_blocked_order(order_id)
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RetryDispatchError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    record_audit(
        admin_id=current_user["id"],
        action="order_dispatch_retried",
        entity_type="order",
        entity_id=order_id,
        new_value=dispatch_status,
    )
    return {
        "success": dispatch_status == "completed",
        "order_id": order_id,
        "dispatch_status": dispatch_status,
    }


# Pydantic-схема для разрешения неоднозначной отправки.
from pydantic import BaseModel  # noqa: E402


class _ResolveDispatchRequest(BaseModel):
    resolution: Literal["not_created", "record_order"]
    supplier_order_id: int | None = None


@router.post("/orders/{order_id}/resolve-dispatch")
def resolve_dispatch_endpoint(
    order_id: int,
    data: _ResolveDispatchRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Операторское разрешение заказа с неопределённым исходом отправки.

    Для 'sending' (застрявшего после сбоя процесса) и 'unknown' (неоднозначный
    ответ после action=add). Слепой автоматический retry запрещён — оператор
    сначала сверяется с панелью поставщика и выбирает resolution.
    """
    try:
        result = resolve_dispatch_order(
            order_id,
            resolution=data.resolution,
            supplier_order_id=data.supplier_order_id,
        )
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except DispatchResolutionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
    ) as error:
        raise _supplier_unavailable(error) from error
    record_audit(
        admin_id=current_user["id"],
        action="order_dispatch_resolved",
        entity_type="order",
        entity_id=order_id,
        new_value=f"{data.resolution}:{data.supplier_order_id or ''}",
    )
    return {
        "success": True,
        "order_id": order_id,
        "dispatch_status": result,
    }


# ---------------------------------------------------------------------------
# Dashboard и статистика
# ---------------------------------------------------------------------------

@router.get("/dashboard")
def admin_dashboard_endpoint():
    """Главная страница: общие показатели. Агрегация выполняется в SQL."""
    try:
        return statistics.get_dashboard_payload()
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/stats/revenue")
def revenue_stats_endpoint(
    period: Literal["today", "7d", "30d", "this_month", "last_month", "custom"] = "7d",
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """Динамика оборота и себестоимости (прибыль = оборот - себестоимость)."""
    try:
        return statistics.get_revenue_stats(period, date_from, date_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/stats/users")
def users_stats_endpoint(
    period: Literal["today", "7d", "30d", "this_month", "last_month", "custom"] = "30d",
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """Динамика регистраций, общее число и активные пользователи."""
    try:
        return statistics.get_users_stats(period, date_from, date_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/stats/traffic")
def traffic_stats_endpoint(
    period: Literal["today", "7d", "30d", "this_month", "last_month", "custom"] = "7d",
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """Динамика посещений: просмотры, уникальные и авторизованные."""
    try:
        return statistics.get_traffic_stats(period, date_from, date_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/finance")
def finance_endpoint(
    period: Literal["today", "7d", "30d", "this_month", "last_month", "custom"] = "30d",
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """Финансовая сводка за период. Все расчёты выполняются на backend."""
    try:
        return statistics.get_finance_summary(period, date_from, date_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


# ---------------------------------------------------------------------------
# Заказы
# ---------------------------------------------------------------------------

@router.get("/orders")
def admin_orders_endpoint(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None, max_length=64),
    sort: Literal["newest", "oldest", "amount_desc", "amount_asc"] = "newest",
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """Список всех заказов: серверная пагинация, поиск, фильтры, сортировка."""
    search = (search or "").strip() or None
    status = (status or "").strip() or None
    start_ts, end_ts = statistics.range_bounds(date_from, date_to)
    session = SessionLocal()
    try:
        rows, total = repository.list_admin_orders(
            session,
            page=page,
            limit=limit,
            search=search,
            status=status,
            start_ts=start_ts,
            end_ts=end_ts,
            sort=sort,
        )
    finally:
        session.close()
    return {
        "items": [repository.serialize_order(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/orders/{order_id}")
def admin_order_detail_endpoint(order_id: int):
    session = SessionLocal()
    try:
        row = repository.get_admin_order(session, order_id)
    finally:
        session.close()
    detail = repository.serialize_order_detail(row)
    if detail is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    return detail


@router.patch("/orders/{order_id}/status")
def admin_order_status_endpoint(
    order_id: int,
    data: OrderStatusUpdateRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Ручное изменение статуса заказа (только безопасные случаи).

    Заказы, созданные у поставщика, синхронизируются автоматически и здесь
    не меняются — ручное вмешательство не ломает синхронизацию.
    """
    try:
        return change_order_status_manual(
            order_id, data.status, current_user["id"]
        )
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OrderStatusChangeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


# ---------------------------------------------------------------------------
# Пользователи
# ---------------------------------------------------------------------------

@router.get("/users")
def admin_users_endpoint(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=100),
    banned: Literal["all", "banned", "active"] = "all",
    user_group: str | None = Query(default=None, max_length=20),
    sort: Literal[
        "newest", "oldest", "id_desc", "id_asc",
        "balance_desc", "balance_asc", "orders_desc",
    ] = "newest",
):
    """Список пользователей с агрегатами заказов (без паролей и токенов)."""
    search = (search or "").strip() or None
    user_group = (user_group or "").strip() or None
    session = SessionLocal()
    try:
        rows, total = repository.list_admin_users(
            session,
            page=page,
            limit=limit,
            search=search,
            banned=banned,
            user_group=user_group,
            sort=sort,
        )
    finally:
        session.close()
    return {
        "items": [repository.serialize_user(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/users/{user_id}")
def admin_user_detail_endpoint(user_id: int):
    """Профиль пользователя: аккаунт, привязки, заказы, обращения, отзывы."""
    session = SessionLocal()
    try:
        user = repository.get_admin_user(session, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        socials = repository.get_user_social_accounts(session, user_id)
        orders = repository.get_user_orders(session, user_id)
        tickets = repository.get_user_tickets(session, user_id)
        reviews = repository.get_user_reviews(session, user_id)
    finally:
        session.close()

    return {
        "user": {
            "id": user["id"],
            "login": user["login"],
            "email": user["mail"],
            "user_group": user["user_group"],
            "balance": format(user["balance"], ".2f"),
            "banned": bool(user["banned"]),
            "created_at": repository._iso(user["created_at"]),
            "last_seen_at": repository._iso(user["last_seen_at"]),
            "ban_reason": user["ban_reason"],
            "banned_by": user["banned_by"],
            "banned_at": repository._iso(user["banned_at"]),
        },
        "social_accounts": socials,
        "orders": orders,
        "tickets": tickets,
        "reviews": reviews,
    }


@router.post("/users/{user_id}/ban")
def admin_ban_user_endpoint(
    user_id: int,
    data: BanUserRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Блокировка пользователя: backend-проверка прав + инвалидация сессий."""
    if user_id == int(current_user["id"]):
        raise HTTPException(status_code=409, detail="Нельзя заблокировать собственный аккаунт")
    if user_id in config.ADMIN_USER_IDS:
        raise HTTPException(status_code=409, detail="Нельзя заблокировать аккаунт администратора")

    session = SessionLocal()
    try:
        with session.begin():
            banned = repository.set_user_banned(
                session,
                user_id=user_id,
                reason=data.reason,
                admin_id=current_user["id"],
            )
    finally:
        session.close()
    if banned is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    record_audit(
        admin_id=current_user["id"],
        action="user_banned",
        entity_type="user",
        entity_id=user_id,
        new_value=data.reason,
    )
    return {"success": True, "user_id": user_id, "banned": True}


@router.post("/users/{user_id}/unban")
def admin_unban_user_endpoint(
    user_id: int,
    current_user: dict = Depends(get_current_admin),
):
    session = SessionLocal()
    try:
        with session.begin():
            unbanned = repository.set_user_unbanned(session, user_id=user_id)
    finally:
        session.close()
    if unbanned is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    record_audit(
        admin_id=current_user["id"],
        action="user_unbanned",
        entity_type="user",
        entity_id=user_id,
    )
    return {"success": True, "user_id": user_id, "banned": False}


# ---------------------------------------------------------------------------
# Отзывы
# ---------------------------------------------------------------------------

@router.get("/reviews")
def admin_reviews_endpoint(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=200),
    rating: int | None = Query(default=None, ge=1, le=5),
    deleted: Literal["all", "active", "deleted"] = "active",
    sort: Literal["newest", "oldest", "highest", "lowest"] = "newest",
):
    search = (search or "").strip() or None
    session = SessionLocal()
    try:
        rows, total = repository.list_admin_reviews(
            session,
            page=page,
            limit=limit,
            search=search,
            rating=rating,
            deleted=deleted,
            sort=sort,
        )
    finally:
        session.close()
    return {
        "items": [repository.serialize_review(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.delete("/reviews/{review_id}")
def admin_delete_review_endpoint(
    review_id: int,
    current_user: dict = Depends(get_current_admin),
):
    """Мягкое удаление отзыва: данные остаются в БД для восстановления."""
    session = SessionLocal()
    try:
        with session.begin():
            deleted = repository.soft_delete_review(
                session,
                review_id=review_id,
                admin_id=current_user["id"],
            )
    finally:
        session.close()
    record_audit(
        admin_id=current_user["id"],
        action="review_deleted",
        entity_type="review",
        entity_id=review_id,
    )
    return {"success": True, "review_id": review_id, "deleted": deleted}


@router.post("/reviews/{review_id}/restore")
def admin_restore_review_endpoint(
    review_id: int,
    current_user: dict = Depends(get_current_admin),
):
    session = SessionLocal()
    try:
        with session.begin():
            restored = repository.restore_review(
                session,
                review_id=review_id,
                admin_id=current_user["id"],
            )
    finally:
        session.close()
    if not restored:
        raise HTTPException(status_code=404, detail="Удалённый отзыв не найден")
    record_audit(
        admin_id=current_user["id"],
        action="review_restored",
        entity_type="review",
        entity_id=review_id,
    )
    return {"success": True, "review_id": review_id, "restored": True}


# ---------------------------------------------------------------------------
# Настройки
# ---------------------------------------------------------------------------

@router.get("/settings")
def admin_settings_endpoint():
    return {
        "markup_percent": str(get_markup_percent()),
        "active_users_window_minutes": get_active_users_window_minutes(),
    }


@router.put("/settings/markup")
def admin_markup_endpoint(
    data: MarkupUpdateRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Глобальная наценка. Влияет только на формирование НОВЫХ цен.

    Цена уже созданных заказов хранится в orders.amount и не пересчитывается.
    """
    old_value = str(get_markup_percent())
    try:
        new_value = set_markup_percent(data.value, admin_id=current_user["id"])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    record_audit(
        admin_id=current_user["id"],
        action="markup_changed",
        entity_type="setting",
        entity_id="global_markup_percent",
        old_value=old_value,
        new_value=str(new_value),
    )
    return {"success": True, "markup_percent": str(new_value)}


@router.put("/settings/active-window")
def admin_active_window_endpoint(
    data: ActiveWindowUpdateRequest,
    current_user: dict = Depends(get_current_admin),
):
    """Окно, в течение которого пользователь считается активным."""
    old_value = str(get_active_users_window_minutes())
    try:
        new_value = set_active_users_window_minutes(
            data.minutes, admin_id=current_user["id"]
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    record_audit(
        admin_id=current_user["id"],
        action="active_window_changed",
        entity_type="setting",
        entity_id="active_users_window_minutes",
        old_value=old_value,
        new_value=str(new_value),
    )
    return {"success": True, "active_users_window_minutes": new_value}


# ---------------------------------------------------------------------------
# Журнал действий администраторов
# ---------------------------------------------------------------------------

@router.get("/audit-log")
def admin_audit_log_endpoint(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    admin_id: int | None = Query(default=None, ge=1),
    action: str | None = Query(default=None, max_length=64),
    entity_type: str | None = Query(default=None, max_length=64),
    search: str | None = Query(default=None, max_length=100),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    search = (search or "").strip() or None
    action = (action or "").strip() or None
    entity_type = (entity_type or "").strip() or None
    start_ts, end_ts = statistics.range_bounds(date_from, date_to)
    session = SessionLocal()
    try:
        items, total = repository.list_audit_log(
            session,
            page=page,
            limit=limit,
            admin_id=admin_id,
            action=action,
            entity_type=entity_type,
            start_ts=start_ts,
            end_ts=end_ts,
            search=search,
        )
    finally:
        session.close()
    return {"items": items, "total": total, "page": page, "limit": limit}
