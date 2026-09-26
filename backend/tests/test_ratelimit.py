"""Тесты DB-backed rate limiter."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.core.ratelimit import (
    RateLimitExceeded,
    check_rate_limits,
    client_ip,
    enforce_rate_limits,
)


class _Scalar:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value


class FakeRateSession:
    def __init__(self, counts):
        self._counts = iter(counts)
        self.committed = False
        self.closed = False

    def execute(self, *args, **kwargs):
        return _Scalar(next(self._counts))

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def close(self):
        self.closed = True


class RateLimitTests(unittest.TestCase):
    def test_within_limit_passes_and_commits(self):
        session = FakeRateSession([3])
        with (
            patch("backend.core.ratelimit.SessionLocal", return_value=session),
            patch("backend.core.ratelimit._maybe_cleanup"),
        ):
            check_rate_limits([("login:ip:1.2.3.4", 5)])
        self.assertTrue(session.committed)
        self.assertTrue(session.closed)

    def test_exceeding_limit_raises_and_persists_attempt(self):
        session = FakeRateSession([6])
        with (
            patch("backend.core.ratelimit.SessionLocal", return_value=session),
            patch("backend.core.ratelimit._maybe_cleanup"),
        ):
            with self.assertRaises(RateLimitExceeded):
                check_rate_limits([("login:ip:1.2.3.4", 5)])
        self.assertTrue(session.committed)

    def test_enforce_returns_http_429_with_retry_after(self):
        session = FakeRateSession([6])
        with (
            patch("backend.core.ratelimit.SessionLocal", return_value=session),
            patch("backend.core.ratelimit._maybe_cleanup"),
        ):
            with self.assertRaises(HTTPException) as context:
                enforce_rate_limits([("login:ip:1.2.3.4", 5)])
        self.assertEqual(context.exception.status_code, 429)
        self.assertEqual(context.exception.headers["Retry-After"], "60")

    def test_client_ip_returns_peer_host(self):
        request = MagicMock()
        request.client.host = "203.0.113.7"
        self.assertEqual(client_ip(request), "203.0.113.7")

    def test_client_ip_without_client_is_unknown(self):
        request = MagicMock()
        request.client = None
        self.assertEqual(client_ip(request), "unknown")


if __name__ == "__main__":
    unittest.main()
