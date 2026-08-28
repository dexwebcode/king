import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from backend.auth.dependencies import get_current_user
from backend.auth.repository import (
    create_user,
    get_user_by_id,
    get_user_by_login_or_email,
)
from backend.auth.schemas import VkLoginRequest
from backend.auth.security import (
    create_access_token,
    hash_md5_password,
)
from backend.auth.social_accounts import (
    get_user_social_account_by_provider_user_id,
    get_user_social_accounts,
    upsert_user_social_account,
)
from backend.core.config import VK_APP_ID, VK_REDIRECT_URL
from backend.core.database import SessionLocal


router = APIRouter()


@router.get("/social/accounts")
def social_accounts(current_user: dict = Depends(get_current_user)):
    session = SessionLocal()

    try:
        accounts = get_user_social_accounts(
            session=session,
            user_id=current_user["id"],
        )

        return {
            "success": True,
            "items": accounts,
        }

    finally:
        session.close()


def fetch_vk_user_info(access_token: str) -> dict:
    body = urlencode({
        "access_token": access_token,
    }).encode("utf-8")
    url = f"https://id.vk.ru/oauth2/user_info?client_id={VK_APP_ID}"
    request = Request(url, data=body, method="POST")

    try:
        with urlopen(request, timeout=8) as response:
            import json

            payload = json.loads(response.read().decode("utf-8"))

    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось проверить VK ID",
        ) from error

    if "error" in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=payload.get("error_description") or "VK ID отклонил токен",
        )

    user = payload.get("user")

    if not isinstance(user, dict) or not user.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="VK ID не вернул данные пользователя",
        )

    return user


def get_available_vk_login(session, vk_user_id: str) -> str:
    base_login = f"vk_{vk_user_id}"

    if get_user_by_login_or_email(session, base_login) is None:
        return base_login

    for index in range(2, 100):
        login = f"{base_login}_{index}"

        if get_user_by_login_or_email(session, login) is None:
            return login

    return f"{base_login}_{secrets.token_hex(4)}"


@router.post("/vk/login")
def vk_login(data: VkLoginRequest):
    vk_user = fetch_vk_user_info(data.access_token)
    vk_user_id = str(vk_user["user_id"])
    vk_email = vk_user.get("email") or f"vk_{vk_user_id}@vk.local"
    vk_name = " ".join(
        part
        for part in [
            vk_user.get("first_name"),
            vk_user.get("last_name"),
        ]
        if part
    ) or None

    session = SessionLocal()

    try:
        social_account = get_user_social_account_by_provider_user_id(
            session=session,
            provider="vk",
            provider_user_id=vk_user_id,
        )

        if social_account is not None:
            user = get_user_by_id(session, social_account["user_id"])

            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Аккаунт VK привязан к удаленному пользователю",
                )

            return {
                "success": True,
                "token": create_access_token(user["id"]),
                "user": {
                    "id": user["id"],
                    "email": user["mail"],
                },
            }

        login = get_available_vk_login(session, vk_user_id)
        password_hash = hash_md5_password(secrets.token_urlsafe(24))

        try:
            user = create_user(
                session=session,
                login=login,
                email=vk_email,
                password=password_hash,
            )

        except IntegrityError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с такой почтой уже существует",
            ) from error

        upsert_user_social_account(
            session=session,
            user_id=user["id"],
            provider="vk",
            provider_user_id=vk_user_id,
            username=vk_name,
        )

        return {
            "success": True,
            "token": create_access_token(user["id"]),
            "user": {
                "id": user["id"],
                "email": user["mail"],
            },
        }

    finally:
        session.close()


@router.get("/vk/callback")
def vk_callback():
    return Response(
        content=f"""
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VK ID</title>
</head>
<body>
  <script>
    if (window.opener) {{
      window.close();
    }} else {{
      window.location.replace("/");
    }}
  </script>
  <p>VK ID настроен. Вернитесь на сайт.</p>
  <p>Redirect URI: {VK_REDIRECT_URL}</p>
</body>
</html>
        """.strip(),
        media_type="text/html",
    )
