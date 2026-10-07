import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { adminApi } from "../adminApi";
import Pagination from "../components/Pagination/Pagination";
import { formatDate, formatMoney, formatNumber } from "../format";
import "../AdminApp/AdminApp.css";

const SORTS = [
    { value: "newest", label: "Сначала новые" },
    { value: "oldest", label: "Сначала старые" },
    { value: "id_desc", label: "ID ↓" },
    { value: "id_asc", label: "ID ↑" },
    { value: "balance_desc", label: "Баланс ↓" },
    { value: "balance_asc", label: "Баланс ↑" },
    { value: "orders_desc", label: "По числу заказов" },
];

const BAN_FILTERS = [
    { value: "all", label: "Все" },
    { value: "active", label: "Активные" },
    { value: "banned", label: "Заблокированные" },
];

export default function UsersAdmin() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [banned, setBanned] = useState("all");
    const [sort, setSort] = useState("newest");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
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
            const data = await adminApi.users({
                page,
                limit: 20,
                search: debouncedSearch || undefined,
                banned,
                sort,
            });
            if (current !== requestId.current) return;
            setItems(Array.isArray(data.items) ? data.items : []);
            setTotal(data.total || 0);
        } catch (requestError) {
            if (current !== requestId.current) return;
            setError(requestError.message || "Не удалось загрузить пользователей");
        } finally {
            if (current === requestId.current) setLoading(false);
        }
    }, [page, debouncedSearch, banned, sort]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}

            <div className="admin-filters">
                <input
                    className="kp-field admin-search"
                    type="search"
                    placeholder="Поиск: ID, логин, email…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <div className="admin-period-tabs">
                    {BAN_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            className={banned === filter.value ? "is-active" : ""}
                            onClick={() => {
                                setBanned(filter.value);
                                setPage(1);
                            }}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
                <select
                    className="kp-field admin-select"
                    value={sort}
                    onChange={(event) => {
                        setSort(event.target.value);
                        setPage(1);
                    }}
                    aria-label="Сортировка"
                >
                    {SORTS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                </select>
            </div>

            <section className="admin-panel">
                {loading ? (
                    <div className="admin-loading">Загружаем пользователей…</div>
                ) : items.length === 0 ? (
                    <div className="admin-empty">Пользователи не найдены.</div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Логин</th>
                                    <th>Email</th>
                                    <th>Группа</th>
                                    <th>Баланс</th>
                                    <th>Заказы</th>
                                    <th>Сумма заказов</th>
                                    <th>Регистрация</th>
                                    <th>Активность</th>
                                    <th>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((user) => (
                                    <tr key={user.id} className="is-clickable" onClick={() => navigate(`/admin/users/${user.id}`)}>
                                        <td><span className="admin-table-link">#{user.id}</span></td>
                                        <td><span className="admin-table-link">{user.login || "—"}</span></td>
                                        <td className="admin-cell-muted">{user.email || "—"}</td>
                                        <td>{user.user_group}</td>
                                        <td className="admin-cell-nowrap">{formatMoney(user.balance)}</td>
                                        <td>{formatNumber(user.orders_count)}</td>
                                        <td className="admin-cell-nowrap">{formatMoney(user.orders_sum)}</td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDate(user.created_at)}</td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDate(user.last_seen_at)}</td>
                                        <td>
                                            {user.banned ? (
                                                <span className="admin-badge admin-badge--banned">Заблокирован</span>
                                            ) : (
                                                <span className="admin-badge admin-badge--active">Активен</span>
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
        </>
    );
}
