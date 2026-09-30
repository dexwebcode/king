"""Pydantic-схемы административного API."""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BanUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _clean_reason(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None


class MarkupUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Decimal


class ActiveWindowUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minutes: int


class OrderStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(min_length=1, max_length=64)

    @field_validator("status", mode="before")
    @classmethod
    def _clean_status(cls, value):
        return value.strip() if isinstance(value, str) else value
