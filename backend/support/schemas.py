"""Pydantic-схемы валидации обращений поддержки."""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .constants import VALID_STATUS_VALUES

MESSAGE_MAX_LENGTH = 5000
SUBJECT_MAX_LENGTH = 200
CONTACT_MAX_LENGTH = 255

# В контакте запрещаем HTML-подобные и управляющие символы.
_FORBIDDEN_CONTACT_RE = re.compile(r"[<>\n\r\t]")
_DANGEROUS_SCHEMES = ("javascript:", "data:", "vbscript:")


class CreateTicketRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str | None = Field(default=None, max_length=SUBJECT_MAX_LENGTH)
    message: str = Field(min_length=10, max_length=MESSAGE_MAX_LENGTH)
    contact: str = Field(min_length=1, max_length=CONTACT_MAX_LENGTH)

    @field_validator("subject", mode="before")
    @classmethod
    def _clean_subject(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        return value or None

    @field_validator("message", mode="before")
    @classmethod
    def _clean_message(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("contact", mode="before")
    @classmethod
    def _clean_contact(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("contact")
    @classmethod
    def _contact_safe(cls, value):
        if _FORBIDDEN_CONTACT_RE.search(value):
            raise ValueError("Контакт не должен содержать HTML или управляющие символы")
        lowered = value.lower()
        if any(lowered.startswith(scheme) for scheme in _DANGEROUS_SCHEMES):
            raise ValueError("Недопустимый формат контакта")
        return value


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)

    @field_validator("message", mode="before")
    @classmethod
    def _clean_message(cls, value):
        return value.strip() if isinstance(value, str) else value


class AdminSendMessageRequest(SendMessageRequest):
    pass


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str

    @field_validator("status", mode="before")
    @classmethod
    def _clean_status(cls, value):
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("status")
    @classmethod
    def _valid_status(cls, value):
        if value not in VALID_STATUS_VALUES:
            raise ValueError("Недопустимый статус обращения")
        return value
