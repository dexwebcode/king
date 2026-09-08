"""Shared, transactional passwordless social authentication."""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth.repository import create_user, get_user_by_id
from backend.auth.social_accounts import (
    create_user_social_account,
    get_user_social_account_by_provider_user_id,
    update_user_social_account_profile,
)


logger = logging.getLogger(__name__)


class SocialAccountBrokenError(RuntimeError):
    pass


def authenticate_social_user(
    session: Session,
    *,
    provider: str,
    provider_user_id: str,
    username: str | None = None,
    display_name: str | None = None,
    avatar_url: str | None = None,
) -> tuple[dict, bool]:
    """Returns (user, created) and never creates local credentials."""
    account = get_user_social_account_by_provider_user_id(
        session, provider, provider_user_id
    )
    if account is not None:
        user = get_user_by_id(session, account["user_id"])
        if user is None:
            raise SocialAccountBrokenError("Social account points to a missing user")
        update_user_social_account_profile(
            session,
            provider=provider,
            provider_user_id=provider_user_id,
            username=username,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        session.commit()
        logger.info("social_auth_success provider=%s user_id=%s created=false", provider, user["id"])
        return dict(user), False

    try:
        user = create_user(session, login=None, email=None, password=None)
        if user is None:
            raise RuntimeError("Database did not return the created user")
        create_user_social_account(
            session,
            user["id"],
            provider,
            provider_user_id,
            username,
            display_name,
            avatar_url,
        )
        session.commit()
        logger.info("social_auth_success provider=%s user_id=%s created=true", provider, user["id"])
        return dict(user), True
    except IntegrityError:
        session.rollback()
        account = get_user_social_account_by_provider_user_id(
            session, provider, provider_user_id
        )
        if account is None:
            logger.warning("social_auth_failed provider=%s reason=integrity_error", provider)
            raise
        user = get_user_by_id(session, account["user_id"])
        if user is None:
            raise SocialAccountBrokenError("Social account points to a missing user")
        logger.info("social_auth_success provider=%s user_id=%s created=false race=true", provider, user["id"])
        return dict(user), False
