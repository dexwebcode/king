import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.core.database import get_db
from . import repository
from .schemas import ReviewInput, ReviewResponse, ReviewSort, ReviewsResponse, ReviewsStats

router = APIRouter(prefix="/api/reviews", tags=["Отзывы"])
logger = logging.getLogger(__name__)


def review_session(session: Session = Depends(get_db)):
    try:
        yield session
    except SQLAlchemyError as error:
        session.rollback()
        logger.exception("Review database operation failed")
        raise HTTPException(status_code=503, detail="Отзывы временно недоступны. Попробуйте позже.") from error


@router.get("", response_model=ReviewsResponse)
def list_reviews(
    sort: ReviewSort = "newest",
    limit: int = Query(default=10, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(review_session),
):
    return repository.list_reviews(session, sort=sort, limit=limit, offset=offset)


@router.get("/stats", response_model=ReviewsStats)
def review_stats(session: Session = Depends(review_session)):
    return repository.review_stats(session)


@router.get("/me", response_model=ReviewResponse | None)
def my_review(current_user: dict = Depends(get_current_user), session: Session = Depends(review_session)):
    return repository.get_my_review(session, current_user["id"])


@router.post("", response_model=ReviewResponse, status_code=201)
def create_review(
    data: ReviewInput,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(review_session),
):
    if repository.insert_review(session, current_user["id"], data) is None:
        raise HTTPException(status_code=409, detail="Вы уже оставили отзыв. Его можно отредактировать.")
    result = repository.get_my_review(session, current_user["id"])
    session.commit()
    return result


@router.put("/me", response_model=ReviewResponse)
def edit_review(
    data: ReviewInput,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(review_session),
):
    if repository.update_review(session, current_user["id"], data) is None:
        raise HTTPException(status_code=404, detail="Ваш отзыв не найден.")
    result = repository.get_my_review(session, current_user["id"])
    session.commit()
    return result
