import { useCallback, useEffect, useRef, useState } from "react";

import { adminApi } from "./adminApi";
import Pagination from "./components/Pagination";
import { formatDate } from "./format";
import "./AdminPanel.css";

const ACTION_LABELS = {
    user_banned: "Пользователь заблокирован",
    user_unbanned: "Пользователь разблокирован",
    review_deleted: "Отзыв удалён",
    review_restored: "Отзыв восстановлен",
    markup_changed: "Наценка изменена",
    active_window_changed: "Период активности изменён",
    ticket_status_changed: "Статус обращения изменён",
    ticket_replied: "Ответ в обращении",
    order_status_changed: "Статус заказа изменён",
    order_dispatch_retried: "Повторная отправка заказа",
    order_dispatch_resolved: "Разрешена ситуация с заказом",
};

const ENTITY_LABELS = {
    user: "Пользователь",
    review: "Отзыв",
    support_ticket: "Обращение",
    order: "Заказ",
    setting: "Настройка",
};

export default function AuditLogAdmin() {
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [action, setAction] = useState("");
    const [entityType, setEntityType] = useState("");
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const requestId = useRef(0);

    const load = useCallback(async () => {
        const current = ++requestId.current;
        setLoading(true);
        setError("");
        try {
            const data = await adminApi.auditLog({
                page,
                limit: 30,
                action: action || undefined,
                entity_type: entityType || undefined,
                search: search.trim() || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            });
            if (current !== requestId.current) return;
            setItems(Array.isArray(data.items) ? data.items : []);
            setTotal(data.total || 0);
        } catch (requestError) {
            if (current !== requestId.current) return;
            setError(requestError.message || "Не удалось загрузить журнал");
        } finally {
            if (current === requestId.current) setLoading(false);
        }
    }, [page, action, entityType, search, dateFrom, dateTo]);

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
                    placeholder="Поиск по ID объекта…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <select className="kp-field admin-select" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} aria-label="Фильтр по действию">
                    <option value="">Все действия</option>
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <select className="kp-field admin-select" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} aria-label="Фильтр по типу объекта">
                    <option value="">Все объекты</option>
                    {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <input className="kp-field" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Дата с" />
                <input className="kp-field" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Дата по" />
                <button className="kp-button kp-button--secondary kp-button--small" type="button" onClick={() => setPage(1) + load()}>
                    Применить
                </button>
            </div>

            <section className="admin-panel">
                {loading ? (
                    <div className="admin-loading">Загружаем журнал…</div>
                ) : items.length === 0 ? (
                    <div className="admin-empty">Записей нет.</div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Время</th>
                                    <th>Администратор</th>
                                    <th>Действие</th>
                                    <th>Объект</th>
                                    <th>Было</th>
                                    <th>Стало</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((entry) => (
                                    <tr key={entry.id}>
                                        <td className="admin-cell-nowrap admin-cell-muted">{formatDate(entry.created_at)}</td>
                                        <td>
                                            <span className="admin-table-link">{entry.admin_login}</span>
                                            <span className="admin-cell-muted"> · {entry.admin_id}</span>
                                        </td>
                                        <td>{ACTION_LABELS[entry.action] || entry.action}</td>
                                        <td>
                                            {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
                                            {entry.entity_id ? <span className="admin-cell-muted"> · {entry.entity_id}</span> : null}
                                        </td>
                                        <td className="admin-cell-muted" style={{ maxWidth: 260, wordBreak: "break-word" }}>{entry.old_value || "—"}</td>
                                        <td style={{ maxWidth: 260, wordBreak: "break-word" }}>{entry.new_value || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination page={page} limit={30} total={total} onPage={setPage} />
            </section>
        </>
    );
}
