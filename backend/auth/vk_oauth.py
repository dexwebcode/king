"""Provider adapter for VK ID OAuth 2.1/PKCE."""

import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from backend.core.config import VK_APP_ID, VK_REDIRECT_URL


logger = logging.getLogger(__name__)


def _post_vk(url: str, body: dict) -> dict:
    request = Request(
        url,
        data=urlencode(body).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        logger.warning("vk_oauth_failed reason=provider_request error=%s", type(error).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Не удалось проверить VK ID",
        ) from error

    if not isinstance(payload, dict) or "error" in payload:
        logger.warning("vk_oauth_failed reason=provider_rejected")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=payload.get("error_description", "VK ID отклонил запрос")
            if isinstance(payload, dict)
            else "VK ID вернул некорректный ответ",
        )
    return payload


def exchange_vk_code(
    *,
    code: str,
    device_id: str,
    state: str,
    code_verifier: str,
) -> str:
    query = urlencode({
        "grant_type": "authorization_code",
        "redirect_uri": VK_REDIRECT_URL,
        "client_id": VK_APP_ID,
        "code_verifier": code_verifier,
        "state": state,
        "device_id": device_id,
    })
    payload = _post_vk(f"https://id.vk.ru/oauth2/auth?{query}", {"code": code})
    if payload.get("state") != state or not payload.get("access_token"):
        logger.warning("vk_oauth_failed reason=state_mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="VK ID вернул ответ для другой сессии",
        )
    return str(payload["access_token"])


def fetch_vk_user_info(access_token: str) -> dict:
    payload = _post_vk(
        f"https://id.vk.ru/oauth2/user_info?client_id={VK_APP_ID}",
        {"access_token": access_token},
    )
    user = payload.get("user")
    if not isinstance(user, dict) or not user.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="VK ID не вернул данные пользователя",
        )
    return user
