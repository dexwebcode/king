from sqlalchemy import text
from sqlalchemy.orm import Session


def create_user_social_account(
    session: Session,
    user_id: int,
    provider: str,
    provider_user_id: str,
    username: str | None,
    display_name: str | None = None,
    avatar_url: str | None = None,
) -> None:
    session.execute(
        text("""
            INSERT INTO public.user_social_accounts (
                user_id,
                provider,
                provider_user_id,
                username,
                display_name,
                avatar_url
            )
            VALUES (
                :user_id,
                :provider,
                :provider_user_id,
                :username,
                :display_name,
                :avatar_url
            )
        """),
        {
            "user_id": user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
        },
    )


def update_user_social_account_profile(
    session: Session,
    *,
    provider: str,
    provider_user_id: str,
    username: str | None,
    display_name: str | None = None,
    avatar_url: str | None = None,
) -> None:
    session.execute(
        text("""
            UPDATE public.user_social_accounts
            SET username = COALESCE(:username, username),
                display_name = COALESCE(:display_name, display_name),
                avatar_url = COALESCE(:avatar_url, avatar_url),
                updated_at = NOW()
            WHERE provider = :provider
              AND provider_user_id = :provider_user_id
        """),
        {
            "provider": provider,
            "provider_user_id": provider_user_id,
            "username": username,
            "display_name": display_name,
            "avatar_url": avatar_url,
        },
    )


def get_user_social_accounts(
    session: Session,
    user_id: int,
) -> list[dict]:
    result = session.execute(
        text("""
            SELECT
                provider,
                provider_user_id,
                username,
                display_name,
                avatar_url,
                created_at,
                updated_at
            FROM public.user_social_accounts
            WHERE user_id = :user_id
            ORDER BY provider
        """),
        {
            "user_id": user_id,
        },
    )

    return [
        dict(row)
        for row in result.mappings().all()
    ]


def get_user_social_account_by_provider_user_id(
    session: Session,
    provider: str,
    provider_user_id: str,
):
    result = session.execute(
        text("""
            SELECT
                user_id,
                provider,
                provider_user_id,
                username
                , display_name
                , avatar_url
            FROM public.user_social_accounts
            WHERE provider = :provider
              AND provider_user_id = :provider_user_id
            LIMIT 1
        """),
        {
            "provider": provider,
            "provider_user_id": provider_user_id,
        },
    )

    return result.mappings().first()


def get_user_social_account_by_user_and_provider(
    session: Session,
    user_id: int,
    provider: str,
):
    result = session.execute(
        text("""
            SELECT
                user_id,
                provider,
                provider_user_id,
                username,
                display_name,
                avatar_url
            FROM public.user_social_accounts
            WHERE user_id = :user_id
              AND provider = :provider
            LIMIT 1
        """),
        {"user_id": user_id, "provider": provider},
    )

    return result.mappings().first()


def delete_user_social_account(
    session: Session,
    user_id: int,
    provider: str,
):
    return session.execute(
        text("""
            DELETE FROM public.user_social_accounts
            WHERE user_id = :user_id
              AND provider = :provider
            RETURNING id
        """),
        {"user_id": user_id, "provider": provider},
    ).first()
