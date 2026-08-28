from sqlalchemy import text
from sqlalchemy.orm import Session


def ensure_user_social_accounts_table(session: Session) -> None:
    session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS public.user_social_accounts (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                provider VARCHAR(32) NOT NULL,
                provider_user_id TEXT NOT NULL,
                username TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (provider, provider_user_id),
                UNIQUE (user_id, provider)
            )
        """)
    )
    session.commit()


def upsert_user_social_account(
    session: Session,
    user_id: int,
    provider: str,
    provider_user_id: str,
    username: str | None,
) -> None:
    ensure_user_social_accounts_table(session)

    session.execute(
        text("""
            INSERT INTO public.user_social_accounts (
                user_id,
                provider,
                provider_user_id,
                username
            )
            VALUES (
                :user_id,
                :provider,
                :provider_user_id,
                :username
            )
            ON CONFLICT (user_id, provider)
            DO UPDATE SET
                provider_user_id = EXCLUDED.provider_user_id,
                username = EXCLUDED.username,
                updated_at = NOW()
        """),
        {
            "user_id": user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
            "username": username,
        },
    )
    session.commit()


def get_user_social_accounts(
    session: Session,
    user_id: int,
) -> list[dict]:
    ensure_user_social_accounts_table(session)

    result = session.execute(
        text("""
            SELECT
                provider,
                provider_user_id,
                username,
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
    ensure_user_social_accounts_table(session)

    result = session.execute(
        text("""
            SELECT
                user_id,
                provider,
                provider_user_id,
                username
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
