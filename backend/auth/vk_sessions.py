import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.config import VK_AUTH_SESSION_EXPIRE_MINUTES


def _hash_state(state: str) -> str:
    return hashlib.sha256(state.encode("utf-8")).hexdigest()


def create_vk_auth_session(session: Session) -> dict:
    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=VK_AUTH_SESSION_EXPIRE_MINUTES
    )
    session.execute(text("DELETE FROM public.vk_auth_sessions WHERE expires_at < NOW()"))
    session.execute(text("""
        INSERT INTO public.vk_auth_sessions (state_hash, code_verifier, expires_at)
        VALUES (:state_hash, :code_verifier, :expires_at)
    """), {
        "state_hash": _hash_state(state),
        "code_verifier": code_verifier,
        "expires_at": expires_at,
    })
    session.commit()
    return {
        "state": state,
        "code_verifier": code_verifier,
        "expires_at": expires_at.isoformat(),
    }


def consume_vk_auth_session(session: Session, state: str) -> str | None:
    result = session.execute(text("""
        UPDATE public.vk_auth_sessions
        SET used_at = NOW()
        WHERE state_hash = :state_hash
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING code_verifier
    """), {"state_hash": _hash_state(state)})
    row = result.mappings().first()
    session.commit()
    return row["code_verifier"] if row else None
