"""Схемы валидации событий внутренней аналитики."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TrackEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visitor_id: str = Field(min_length=8, max_length=64)
    event_type: Literal["pageview"] = "pageview"
    path: str = Field(default="", max_length=300)

    @field_validator("visitor_id", "path", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("path")
    @classmethod
    def _path_without_query(cls, value: str) -> str:
        """Храним только путь без query string и хеша."""
        return value.split("?", 1)[0].split("#", 1)[0]
