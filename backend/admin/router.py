import logging
from typing import Literal
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth.repository import count_legacy_password_hashes
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
from .dependencies import get_current_admin
from .service import (
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
def retry_dispatch_endpoint(order_id: int):
    try:
        dispatch_status = retry_blocked_order(order_id)
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RetryDispatchError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "success": dispatch_status == "completed",
        "order_id": order_id,
        "dispatch_status": dispatch_status,
    }


class ResolveDispatchRequest(BaseModel):
    resolution: Literal["not_created", "record_order"]
    supplier_order_id: int | None = None


@router.post("/orders/{order_id}/resolve-dispatch")
def resolve_dispatch_endpoint(order_id: int, data: ResolveDispatchRequest):
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
    return {
        "success": True,
        "order_id": order_id,
        "dispatch_status": result,
    }
