import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { adminApi } from "../adminApi";
import Pagination from "../components/Pagination/Pagination";
import { ORDER_STATUSES, formatDateShort, formatMoney, orderStatusTone } from "../format";
import "../AdminApp/AdminApp.css";

const SORTS = [
    { value: "newest", label: "Сначала новые" },
    { value: "oldest", label: "Сначала старые" },
    { value: "amount_desc", label: "По сумме ↓" },
    { value: "amount_asc", label: "По сумме ↑" },
];

export default function OrdersAdmin() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [status, setStatus] = useState("");
    const [sort, setSort] = useState("newest");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
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
            const data = await adminApi.orders({
                page,
                limit: 20,
                search: debouncedSearch || undefined,
                status: status || undefined,
                sort,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            });
            if (current !== requestId.current) return;
            setItems(Array.isArray(data.items) ? data.items : []);
            setTotal(data.total || 0);
        } catch (requestError) {
            if (current !== requestId.current) return;
            setError(requestError.message || "Не удалось загрузить заказы");
        } finally {
            if (current === requestId.current) setLoading(false);
        }
    }, [page, debouncedSearch, status, sort, dateFrom, dateTo]);

    useEffect(() => {
        load();
    }, [load]);

    function applyFilters() {
        setPage(1);
        load();
    }

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}

            <div className="admin-filters">
                <input
                    className="kp-field admin-search"
                    type="search"
                    placeholder="Поиск: ID заказа, ID пользователя, логин, ссылка…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <select
                    className="kp-field admin-select"
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                    aria-label="Фильтр по статусу"
                >
                    <option value="">Все статусы</option>
                    {ORDER_STATUSES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                    ))}
                </select>
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
                <input
                    className="kp-field"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    aria-label="Дата с"
                />
                <input
                    className="kp-field"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    aria-label="Дата по"
                />
                <button className="kp-button kp-button--secondary kp-button--small" type="button" onClick={applyFilters}>
                    Применить
                </button>
            </div>

            <section className="admin-panel">
                {loading ? (
                    <div className="admin-loading">Загружаем заказы…</div>
                ) : items.length === 0 ? (
                    <div className="admin-empty">Заказы не найдены. Измените фильтры или поиск.</div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Пользователь</th>
                                    <th>Услуга</th>
                                    <th>Площадка</th>
                                    <th>Ссылка</th>
                                    <th>Кол-во</th>
                                    <th>Сумма</th>
                                    <th>Себестоимость</th>
                                    <th>Статус</th>
                                    <th>Создан</th>
                                    <th>Обновлён</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((order) => (
                                    <tr key={order.id} className="is-clickable" onClick={() => navigate(`/admin/orders/${order.id}`)}>
                                        <td>
                                            <span className="admin-table-link">#{order.id}</span>
                                            {order.supplier_order_id ? <span className="admin-cell-muted"> / {order.supplier_order_id}</span> : null}
                                        </td>
                                        <td>
                                            <span className="admin-table-link">{order.user_login}</span>
                                            <span className="admin-cell-muted"> · {order.user_id}</span>
                                        </td>
                                        <td>#{order.service_id}</td>
                                        <td>{order.platform || "—"}</td>
                                        <td className="admin-cell-link">
                                            <a href={order.link} target="_blank" rel="noreferrer noopener" onClick={(event) => event.stopPropagation()}>
                                                {order.link}
                                            </a>
                                        </td>
                                        <td>{Number(order.quantity).toLocaleString("ru-RU")}</td>
                                        <td className="admin-cell-nowrap">{formatMoney(order.amount)}</td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{order.supplier_cost ? formatMoney(order.supplier_cost) : "—"}</td>
                                        <td>
                                            <span className={`kp-status kp-status--${orderStatusTone(order.status)}`}>
                                                <i />
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDateShort(order.created_ts || order.created_at)}</td>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDateShort(order.payment_updated_at)}</td>
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
