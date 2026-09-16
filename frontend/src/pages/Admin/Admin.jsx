import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, EmptyState, PageHeader, Panel, StatusBadge } from "../../ui/AppShell";
import { formatMoney } from "../../ui/catalogMeta";
import "./Admin.css";

const API_URL = import.meta.env.VITE_API_URL || "";

async function adminRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}`, ...options.headers },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(data?.detail || "Ошибка запроса к серверу");
        error.status = response.status;
        throw error;
    }
    return data;
}

const attentionLabels = {
    awaiting_dispatch: "Ожидает отправки",
    insufficient_supplier_balance: "Недостаточно средств",
    supplier_unavailable: "Поставщик недоступен",
    manual_review: "Ручная проверка",
};

export default function Admin() {
    const [balance, setBalance] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [retryingId, setRetryingId] = useState(null);
    const [forbidden, setForbidden] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const handleRequestError = useCallback((requestError) => {
        if (requestError.status === 403) setForbidden(true);
        setError(requestError.message || "Не удалось загрузить админ-панель");
    }, []);
    const loadBalance = useCallback(async () => setBalance(await adminRequest("/api/admin/supplier/balance")), []);
    const loadOrders = useCallback(async () => {
        const data = await adminRequest("/api/admin/orders/attention");
        setOrders(Array.isArray(data?.items) ? data.items : []);
    }, []);

    useEffect(() => {
        let active = true;
        Promise.all([loadBalance(), loadOrders()]).catch((requestError) => active && handleRequestError(requestError)).finally(() => active && setLoading(false));
        const intervalId = window.setInterval(() => loadBalance().catch(handleRequestError), 30_000);
        return () => { active = false; window.clearInterval(intervalId); };
    }, [handleRequestError, loadBalance, loadOrders]);

    const counts = useMemo(() => ({
        awaiting: orders.filter((item) => item.attention_kind === "awaiting_dispatch").length,
        insufficient: orders.filter((item) => item.attention_kind === "insufficient_supplier_balance").length,
        review: orders.filter((item) => ["manual_review", "supplier_unavailable"].includes(item.attention_kind)).length,
    }), [orders]);

    async function handleRefresh() {
        try {
            setRefreshing(true); setError("");
            await Promise.all([loadBalance(), loadOrders()]);
        } catch (requestError) { handleRequestError(requestError); }
        finally { setRefreshing(false); }
    }

    async function handleRetry(orderId) {
        try {
            setRetryingId(orderId); setError(""); setNotice("");
            const result = await adminRequest(`/api/admin/orders/${orderId}/retry-dispatch`, { method: "POST" });
            setNotice(result.dispatch_status === "completed" ? `Заказ №${orderId} отправлен поставщику.` : `Заказ №${orderId}: ${result.dispatch_status}.`);
            await Promise.all([loadBalance(), loadOrders()]);
        } catch (requestError) { handleRequestError(requestError); }
        finally { setRetryingId(null); }
    }

    if (loading) return <AppShell active="admin"><Panel className="admin-message">Проверяем права администратора…</Panel></AppShell>;
    if (forbidden) return <AppShell><Panel className="admin-denied"><p className="kp-eyebrow">403 · доступ запрещён</p><h1>Админ-панель недоступна</h1><p>У текущего аккаунта нет административных прав.</p><Link className="kp-button" to="/main">Вернуться в кабинет</Link></Panel></AppShell>;

    return (
        <AppShell active="admin" contentClassName="admin-page">
            <PageHeader eyebrow="Операционный центр" title="Контроль заказов" description="Рабочий баланс поставщика и оплаченные заказы, которые требуют внимания." actions={<button className="kp-button kp-button--secondary" type="button" onClick={handleRefresh} disabled={refreshing}>{refreshing ? "Обновляем…" : "Обновить"}</button>} />
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <section className="admin-stats">
                <Panel className="admin-balance"><span>Баланс поставщика</span><strong>{balance ? `${formatMoney(balance.balance)} ${balance.currency}` : "—"}</strong><small>Проверено {balance?.checked_at ? new Date(balance.checked_at).toLocaleTimeString("ru-RU") : "—"}</small></Panel>
                <Panel><span>Ожидают отправки</span><strong>{counts.awaiting}</strong></Panel>
                <Panel><span>Не хватает средств</span><strong>{counts.insufficient}</strong></Panel>
                <Panel><span>Ручная проверка</span><strong>{counts.review}</strong></Panel>
            </section>

            <Panel className="admin-orders">
                <div className="admin-section-head"><div><p className="kp-eyebrow">Очередь внимания</p><h2>Оплаченные заказы</h2></div><span>{orders.length}</span></div>
                {orders.length === 0 ? <EmptyState>Все оплаченные заказы обработаны.</EmptyState> : (
                    <div className="admin-orders-list">
                        {orders.map((order) => (
                            <article key={order.id}>
                                <div className="admin-order-main"><small>Заказ №{order.id} · услуга #{order.service_id}</small><strong>{attentionLabels[order.attention_kind] || "Требует внимания"}</strong><p>{Number(order.quantity).toLocaleString("ru-RU")} шт. · клиент оплатил {formatMoney(order.public_amount)} ₽{order.supplier_cost ? ` · поставщику ${formatMoney(order.supplier_cost)} ₽` : ""}</p></div>
                                <StatusBadge status={order.dispatch_status}>{order.status}</StatusBadge>
                                {order.can_retry ? <button className="kp-button kp-button--small" type="button" disabled={retryingId === order.id} onClick={() => handleRetry(order.id)}>{retryingId === order.id ? "Отправляем…" : "Повторить"}</button> : <span className="admin-review-note">Повтор запрещён до ручной проверки</span>}
                            </article>
                        ))}
                    </div>
                )}
            </Panel>
        </AppShell>
    );
}
