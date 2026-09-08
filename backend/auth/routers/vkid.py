"""VK ID OAuth/PKCE flow with server-side state validation and code exchange."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.auth.schemas import VkLoginRequest
from backend.auth.security import create_access_token
from backend.auth.social_accounts import get_user_social_accounts
from backend.auth.social_auth import SocialAccountBrokenError, authenticate_social_user
from backend.auth.vk_oauth import fetch_vk_user_info
from backend.core.database import get_db


router = APIRouter()


@router.get("/social/accounts")
def social_accounts(
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    return {
        "success": True,
        "items": get_user_social_accounts(session=session, user_id=current_user["id"]),
    }


@router.post("/vk/login")
def vk_login(data: VkLoginRequest, session: Session = Depends(get_db)):
    vk_user = fetch_vk_user_info(data.access_token)
    vk_user_id = str(vk_user["user_id"])
    display_name = " ".join(
        part for part in [vk_user.get("first_name"), vk_user.get("last_name")] if part
    ) or None

    try:
        user, created = authenticate_social_user(
            session,
            provider="vk",
            provider_user_id=vk_user_id,
            display_name=display_name,
            avatar_url=vk_user.get("avatar"),
        )
    except SocialAccountBrokenError as error:
        raise HTTPException(status_code=409, detail="Связь VK повреждена") from error

    return {
        "success": True,
        "created": created,
        "token": create_access_token(user["id"]),
        "user": {"id": user["id"], "login": user["login"], "email": user["mail"]},
    }


@router.get("/vk/callback")
def vk_callback():
    return Response(
        content="""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VK ID</title></head>
<body><script>if(window.opener){window.close()}else{window.location.replace('/')}</script>
<p>VK ID настроен. Вернитесь на сайт.</p></body></html>""",
        media_type="text/html",
    )
