import re
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator


class CreateOrderRequest(BaseModel):
    service_id: str | int
    quantity: int = Field(gt=0)
    recipient_link: AnyHttpUrl
    payment_method: Literal["sbp"]
    idempotence_key: UUID

    @field_validator("recipient_link", mode="before")
    @classmethod
    def normalize_recipient_link(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value and not re.match(r"^[a-z][a-z0-9+.-]*://", value, re.IGNORECASE):
                value = f"https://{value.lstrip('/')}"
        return value


class CreateOrderResponse(BaseModel):
    order_id: int
    payment_id: str | None = None
    confirmation_url: str | None = None
    status: str


class OrderStatusResponse(BaseModel):
    id: int
    status: str
    amount: str
    currency: str
    payment_status: str | None = None
    dispatch_status: str | None = None
    message: str | None = None


class CreateBalanceTopUpRequest(BaseModel):
    amount: Decimal = Field(ge=10, le=100_000, max_digits=8, decimal_places=2)
    payment_method: Literal["sbp"]
    idempotence_key: UUID


class CreateBalanceTopUpResponse(BaseModel):
    top_up_id: int
    payment_id: str | None = None
    confirmation_url: str | None = None
    status: str


class BalanceTopUpStatusResponse(BaseModel):
    id: int
    status: str
    amount: str
    currency: str
    balance: str
