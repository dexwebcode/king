"""Тесты инвалидации JWT по версии токена (logout / смена пароля)."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from jose import jwt

from backend.auth.dependencies import get_current_user
from backend.auth.security import create_access_token, decode_access_token
from backend.core.config import JWT_ALGORITHM, SECRET_KEY


class _FakeSession:
    pass


def _user(version):
    return {"id": 7, "login": "ava", "mail": None, "token_version": version}


class TokenVersionTests(unittest.TestCase):
    def test_matching_version_is_accepted(self):
        token = create_access_token(7, 0)
        with patch(
            "backend.auth.dependencies.get_user_by_id", return_value=_user(0)
        ):
            user = get_current_user(
                authorization=f"Bearer {token}", session=_FakeSession()
            )
        self.assertEqual(user["id"], 7)

    def test_stale_version_is_rejected(self):
        token = create_access_token(7, 1)
        with patch(
            "backend.auth.dependencies.get_user_by_id", return_value=_user(2)
        ):
            with self.assertRaises(HTTPException) as context:
                get_current_user(
                    authorization=f"Bearer {token}", session=_FakeSession()
                )
        self.assertEqual(context.exception.status_code, 401)

    def test_legacy_token_without_version_decodes_to_zero(self):
        # Токен, выпущенный до введения ver (без claim), считается версией 0.
        legacy = jwt.encode(
            {
                "sub": "7",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
            },
            SECRET_KEY,
            algorithm=JWT_ALGORITHM,
        )
        self.assertEqual(decode_access_token(legacy), (7, 0))


if __name__ == "__main__":
    unittest.main()
