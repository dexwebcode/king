import re
from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator


class CreateOrderRequest(BaseModel):
    service_id: str | int
    quantity: int = Field(ge=100, le=10000, multiple_of=100)
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
