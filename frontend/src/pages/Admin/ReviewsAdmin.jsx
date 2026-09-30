import { useCallback, useEffect, useRef, useState } from "react";

import { adminApi } from "./adminApi";
import ConfirmModal from "./components/ConfirmModal";
import Pagination from "./components/Pagination";
import { formatDate } from "./format";
import "./AdminPanel.css";

const DELETED_FILTERS = [
    { value: "active", label: "Активные" },
    { value: "deleted", label: "Удалённые" },
    { value: "all", label: "Все" },
];

export default function ReviewsAdmin() {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [rating, setRating] = useState("");
    const [deleted, setDeleted] = useState("active");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const requestId = useRef(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        const current = ++requestId.current;
        setLoading(true);
        setError("");
        try {
            const data = await adminApi.reviews({
                page,
                limit: 20,
                search: debouncedSearch || undefined,
                rating: rating || undefined,
                deleted,
            });
            if (current !== requestId.current) return;
            setItems(Array.isArray(data.items) ? data.items : []);
            setTotal(data.total || 0);
        } catch (requestError) {
            if (current !== requestId.current) return;
            setError(requestError.message || "Не удалось загрузить отзывы");
        } finally {
            if (current === requestId.current) setLoading(false);
        }
    }, [page, debouncedSearch, rating, deleted]);

    useEffect(() => {
        load();
    }, [load]);

    async function handleDelete() {
        if (!deleteTarget) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await adminApi.deleteReview(deleteTarget.id);
            setNotice(`Отзыв #${deleteTarget.id} удалён (мягкое удаление, данные сохранены).`);
            setDeleteTarget(null);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось удалить отзыв");
        } finally {
            setBusy(false);
        }
    }

    async function handleRestore(review) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await adminApi.restoreReview(review.id);
            setNotice(`Отзыв #${review.id} восстановлен.`);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось восстановить отзыв");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-filters">
                <input
                    className="kp-field admin-search"
                    type="search"
                    placeholder="Поиск по тексту отзыва или логину…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <select
                    className="kp-field admin-select"
                    value={rating}
                    onChange={(event) => {
                        setRating(event.target.value);
                        setPage(1);
                    }}
                    aria-label="Фильтр по оценке"
                >
                    <option value="">Любая оценка</option>
                    {[5, 4, 3, 2, 1].map((value) => (
                        <option key={value} value={value}>{value} ★</option>
                    ))}
                </select>
                <div className="admin-period-tabs">
                    {DELETED_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={deleted === filter.value ? "is-active" : ""}
                            onClick={() => {
                                setDeleted(filter.value);
                                setPage(1);
                            }}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            <section className="admin-panel">
                {loading ? (
                    <div className="admin-loading">Загружаем отзывы…</div>
                ) : items.length === 0 ? (
                    <div className="admin-empty">Отзывы не найдены.</div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Пользователь</th>
                                    <th>Оценка</th>
                                    <th>Текст</th>
                                    <th>Дата</th>
                                    <th>Статус</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((review) => (
                                    <tr key={review.id}>
                                        <td>#{review.id}</td>
                                        <td>
                                            <span className="admin-table-link">{review.user_login}</span>
                                            <span className="admin-cell-muted"> · {review.user_id}</span>
                                        </td>
                                        <td>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</td>
                                        <td style={{ maxWidth: 420 }}>{review.text}</td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDate(review.created_at)}</td>
                                        <td>
                                            {review.deleted ? (
                                                <span className="admin-badge admin-badge--banned">Удалён</span>
                                            ) : (
                                                <span className="admin-badge admin-badge--active">Опубликован</span>
                                            )}
                                        </td>
                                        <td className="admin-cell-nowrap">
                                            {review.deleted ? (
                                                <button
                                                    className="kp-button kp-button--secondary kp-button--small"
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => handleRestore(review)}
                                                >
                                                    Восстановить
                                                </button>
                                            ) : (
                                                <button
                                                    className="kp-button kp-button--danger kp-button--small"
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => setDeleteTarget(review)}
                                                >
                                                    Удалить
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination page={page} limit={20} total={total} onPage={setPage} />
            </section>

            <ConfirmModal
                open={Boolean(deleteTarget)}
                title="Вы действительно хотите удалить отзыв?"
                confirmLabel="Удалить отзыв"
                danger
                busy={busy}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            >
                <p>
                    Отзыв #{deleteTarget?.id} от пользователя {deleteTarget?.user_login} будет скрыт с сайта.
                    Используется мягкое удаление: данные сохраняются, и отзыв можно восстановить.
                </p>
            </ConfirmModal>
        </>
    );
}
