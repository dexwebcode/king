from fastapi import Depends, HTTPException, status

from backend.auth.dependencies import get_current_user
from backend.core import config


def get_current_admin(
    current_user: dict = Depends(get_current_user),
) -> dict:
    if int(current_user["id"]) not in config.ADMIN_USER_IDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав администратора",
        )
    return current_user
