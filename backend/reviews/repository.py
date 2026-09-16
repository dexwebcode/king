from sqlalchemy import text

# Public author fields come from existing accounts, never from a review payload.
REVIEW_SELECT = """
    SELECT r.id, r.user_id, r.rating, r.text, r.created_at, r.updated_at,
           COALESCE(NULLIF(u.login, ''), NULLIF(s.username, ''),
                    NULLIF(s.display_name, ''), 'Пользователь') AS login,
           s.avatar_url
    FROM migration_temp.reviews r
    JOIN migration_temp.users u ON u.id = r.user_id
    LEFT JOIN LATERAL (
        SELECT username, display_name, avatar_url
        FROM public.user_social_accounts
        WHERE user_id = u.id ORDER BY id LIMIT 1
    ) s ON TRUE
"""
SORT_ORDERS = {
    "newest": "r.created_at DESC, r.id DESC",
    "oldest": "r.created_at ASC, r.id ASC",
    "highest": "r.rating DESC, r.id DESC",
    "lowest": "r.rating ASC, r.id ASC",
}


def serialize_review(row):
    if row is None:
        return None
    return {
        "id": row["id"], "rating": row["rating"], "text": row["text"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "user": {"id": row["user_id"], "login": row["login"], "avatar_url": row["avatar_url"]},
    }


def list_reviews(session, *, sort, limit, offset):
    # Only a fixed allowlist can become an SQL fragment.
    rows = session.execute(text(
        REVIEW_SELECT + f" ORDER BY {SORT_ORDERS[sort]} LIMIT :limit OFFSET :offset"
    ), {"limit": limit + 1, "offset": offset}).mappings().all()
    return {
        "items": [serialize_review(row) for row in rows[:limit]],
        "next_offset": offset + limit if len(rows) > limit else None,
    }


def get_my_review(session, user_id):
    row = session.execute(text(REVIEW_SELECT + " WHERE r.user_id = :user_id"),
                          {"user_id": user_id}).mappings().first()
    return serialize_review(row)


def review_stats(session):
    rows = session.execute(text("""
        SELECT rating, COUNT(*) AS count FROM migration_temp.reviews GROUP BY rating
    """)).mappings().all()
    distribution = {rating: 0 for rating in range(1, 6)}
    distribution.update({row["rating"]: row["count"] for row in rows})
    total = sum(distribution.values())
    return {
        "total": total,
        "average": round(sum(rating * count for rating, count in distribution.items()) / total, 2) if total else None,
        "distribution": distribution,
    }


def insert_review(session, user_id, data):
    # ON CONFLICT uses the database unique constraint, including concurrent POSTs.
    return session.execute(text("""
        INSERT INTO migration_temp.reviews (user_id, rating, text)
        VALUES (:user_id, :rating, :text)
        ON CONFLICT (user_id) DO NOTHING RETURNING id
    """), {"user_id": user_id, **data.model_dump()}).scalar_one_or_none()


def update_review(session, user_id, data):
    return session.execute(text("""
        UPDATE migration_temp.reviews SET rating = :rating, text = :text, updated_at = NOW()
        WHERE user_id = :user_id RETURNING id
    """), {"user_id": user_id, **data.model_dump()}).scalar_one_or_none()
