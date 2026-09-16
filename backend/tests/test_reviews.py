"""Run PostgreSQL integration cases with REVIEWS_TEST_DATABASE_URL pointing to a disposable *_test database."""
import json
import os
import socket
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from unittest.mock import patch

import uvicorn
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from backend.auth.security import create_access_token
from backend.core.database import get_db
from backend.reviews.router import router
from backend.reviews.schemas import ReviewInput


class ReviewValidationTests(unittest.TestCase):
    def test_trim_and_boundaries(self):
        self.assertEqual(ReviewInput(rating=1, text="  1234567890 \n").text, "1234567890")
        self.assertEqual(len(ReviewInput(rating=5, text="я" * 1000).text), 1000)

    def test_invalid_inputs_and_untrusted_author_are_rejected(self):
        invalid = [{"text": "Valid review text"}, *({"rating": n, "text": "Valid review text"} for n in [0, 6, True, 1.5, "5"]),
                   *({"rating": 5, "text": value} for value in ["", " " * 30, "short", "я" * 1001]),
                   {"rating": 5, "text": "Valid review text", "user_id": 99}]
        for payload in invalid:
            with self.subTest(payload=str(payload)[:80]), self.assertRaises(ValidationError):
                ReviewInput(**payload)


@unittest.skipUnless(os.getenv("REVIEWS_TEST_DATABASE_URL"), "Requires disposable PostgreSQL REVIEWS_TEST_DATABASE_URL")
class ReviewsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = os.environ["REVIEWS_TEST_DATABASE_URL"]
        if not (make_url(url).database or "").endswith("_test"):
            raise RuntimeError("Refusing to modify a database whose name does not end in _test")
        cls.engine = create_engine(url)
        cls.sessions = sessionmaker(bind=cls.engine)
        with cls.engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS migration_temp"))
            connection.execute(text("""CREATE TABLE IF NOT EXISTS migration_temp.users (
                id BIGSERIAL PRIMARY KEY, login TEXT, mail TEXT, password TEXT, balance NUMERIC DEFAULT 0
            )"""))
            connection.execute(text("""CREATE TABLE IF NOT EXISTS public.user_social_accounts (
                id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES migration_temp.users(id),
                provider TEXT, username TEXT, display_name TEXT, avatar_url TEXT
            )"""))
        raw = cls.engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                cursor.execute((Path(__file__).parents[1] / "migrations/003_reviews.sql").read_text())
            raw.commit()
        finally:
            raw.close()
        app = FastAPI()
        app.include_router(router)
        def test_db():
            with cls.sessions() as session:
                yield session
        app.dependency_overrides[get_db] = test_db
        cls.sock = socket.socket()
        cls.sock.bind(("127.0.0.1", 0))
        cls.base = f"http://127.0.0.1:{cls.sock.getsockname()[1]}"
        cls.server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        cls.thread = threading.Thread(target=cls.server.run, kwargs={"sockets": [cls.sock]}, daemon=True)
        cls.thread.start()
        for _ in range(100):
            if cls.server.started:
                break
            time.sleep(.02)
        else:
            raise RuntimeError("Test API did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        cls.sock.close()
        cls.engine.dispose()

    def setUp(self):
        with self.engine.begin() as connection:
            connection.execute(text("TRUNCATE migration_temp.reviews, public.user_social_accounts, migration_temp.users RESTART IDENTITY CASCADE"))
            connection.execute(text("INSERT INTO migration_temp.users(id, login, mail) SELECT n, 'user-' || n, 'u' || n || '@example.test' FROM generate_series(1,25) n"))

    def request(self, path="", method="GET", body=None, user=None, token=None):
        headers = {"Content-Type": "application/json"}
        if user:
            token = create_access_token(user)
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(self.base + "/api/reviews" + path, method=method, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            response = build_opener(ProxyHandler({})).open(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def create(self, user=1, rating=5):
        return self.request(method="POST", user=user, body={"rating": rating, "text": f"Review from user {user}"})

    def test_public_reads_and_empty_statistics(self):
        self.assertEqual(self.request(), (200, {"items": [], "next_offset": None}))
        self.assertEqual(self.request("/stats")[1], {"total": 0, "average": None, "distribution": {str(n): 0 for n in range(1,6)}})

    def test_authentication_and_private_endpoints(self):
        for path, method, body in [("", "POST", {"rating": 5, "text": "A useful review"}), ("/me", "GET", None), ("/me", "PUT", {"rating": 4, "text": "Updated review"})]:
            self.assertEqual(self.request(path, method, body)[0], 401)
            self.assertEqual(self.request(path, method, body, token="invalid")[0], 401)
        self.assertEqual(self.request("/me", user=999)[0], 401)
        self.assertEqual(self.request("/me", user=1), (200, None))

    def test_create_edit_author_and_privacy(self):
        status, review = self.create()
        self.assertEqual(status, 201)
        self.assertEqual(review["user"], {"id": 1, "login": "user-1", "avatar_url": None})
        self.assertNotIn("mail", str(review))
        self.assertEqual(self.create()[0], 409)
        self.assertEqual(self.request("/me", "PUT", {"rating": 3, "text": "  Edited review text  "}, user=2)[0], 404)
        status, edited = self.request("/me", "PUT", {"rating": 3, "text": "  Edited review text  "}, user=1)
        self.assertEqual(status, 200)
        self.assertEqual(edited["id"], review["id"])
        self.assertEqual(edited["created_at"], review["created_at"])
        self.assertEqual(edited["text"], "Edited review text")
        self.assertEqual(self.request("/stats")[1]["average"], 3)

    def test_http_validation(self):
        for body in [{"text": "Valid review text"}, {"rating": 0, "text": "Valid review text"}, {"rating": 6, "text": "Valid review text"},
                     *({"rating": 5, "text": t} for t in ["", " " * 12, "short", "a" * 1001]),
                     {"rating": 5, "text": "Valid review text", "user_id": 2}]:
            self.assertEqual(self.request(method="POST", body=body, user=1)[0], 422)
        for path in ["?limit=0", "?limit=51", "?offset=-1", "?sort=invalid"]:
            self.assertEqual(self.request(path)[0], 422)

    def test_pagination_all_sorts_and_statistics(self):
        for user in range(1,24):
            self.assertEqual(self.create(user, user % 5 + 1)[0], 201)
        for sort, key, reverse in [("newest", "id", True), ("oldest", "id", False), ("highest", "rating", True), ("lowest", "rating", False)]:
            reviews, offset = [], 0
            while offset is not None:
                status, page = self.request(f"?sort={sort}&offset={offset}")
                self.assertEqual(status, 200)
                self.assertLessEqual(len(page["items"]), 10)
                reviews.extend(page["items"])
                offset = page["next_offset"]
            self.assertEqual(len({r["id"] for r in reviews}), 23)
            values = [r[key] for r in reviews]
            self.assertEqual(values, sorted(values, reverse=reverse))
        stats = self.request("/stats")[1]
        self.assertEqual(stats["total"], 23)
        self.assertEqual(sum(stats["distribution"].values()), 23)
        self.assertEqual(stats["average"], round(sum(u % 5 + 1 for u in range(1,24))/23, 2))

    def test_social_profile_join_does_not_duplicate_reviews(self):
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE migration_temp.users SET login = NULL WHERE id = 1"))
            connection.execute(text("INSERT INTO public.user_social_accounts(user_id, provider, username, avatar_url) VALUES (1,'telegram','social-user','https://example.test/avatar.png'),(1,'vk','second',NULL)"))
        review = self.create()[1]
        self.assertEqual(review["user"]["login"], "social-user")
        self.assertEqual(review["user"]["avatar_url"], "https://example.test/avatar.png")
        self.assertEqual(len(self.request()[1]["items"]), 1)

    def test_concurrent_creation_has_one_winner(self):
        with ThreadPoolExecutor(max_workers=4) as executor:
            statuses = list(executor.map(lambda _: self.create()[0], range(4)))
        self.assertEqual(sorted(statuses), [201, 409, 409, 409])
        self.assertEqual(self.request("/stats")[1]["total"], 1)

    def test_database_constraints(self):
        self.create()
        for values in [(1, 5, "Duplicate review"), (2, 6, "Invalid rating"), (2, 5, "short"), (999, 5, "Missing author")]:
            with self.assertRaises(IntegrityError), self.engine.begin() as connection:
                connection.execute(text("INSERT INTO migration_temp.reviews(user_id,rating,text) VALUES (:u,:r,:t)"), dict(zip(["u","r","t"], values)))

    def test_database_failure_is_sanitized(self):
        with patch("backend.reviews.repository.list_reviews", side_effect=SQLAlchemyError("secret SQL")):
            status, data = self.request()
        self.assertEqual(status, 503)
        self.assertNotIn("secret", json.dumps(data))


if __name__ == "__main__":
    unittest.main()
