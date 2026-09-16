from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ReviewSort = Literal["newest", "oldest", "highest", "lowest"]


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: int = Field(ge=1, le=5, strict=True)
    text: str = Field(min_length=10, max_length=1000)

    @field_validator("text", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class ReviewUser(BaseModel):
    id: int
    login: str
    avatar_url: str | None = None


class ReviewResponse(BaseModel):
    id: int
    user: ReviewUser
    rating: int
    text: str
    created_at: datetime
    updated_at: datetime


class ReviewsResponse(BaseModel):
    items: list[ReviewResponse]
    next_offset: int | None


class ReviewsStats(BaseModel):
    total: int
    average: float | None
    distribution: dict[int, int]
