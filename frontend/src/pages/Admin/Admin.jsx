import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, EmptyState, PageHeader, Panel, StatusBadge } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
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
    const { t } = useLanguage();
    const [balance, setBalance] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [retryingId, setRetryingId] = useState(null);
    const [forbidden, setForbidden] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [resolveOrder, setResolveOrder] = useState(null);
    const [supplierOrderId, setSupplierOrderId] = useState("");
    const [resolving, setResolving] = useState(false);

    const handleRequestError = useCallback((requestError) => {
        if (requestError.status === 403) setForbidden(true);
        setError(requestError.message || t("Не удалось загрузить админ-панель"));
    }, [t]);
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
            setNotice(result.dispatch_status === "completed" ? t("Заказ №{orderId} отправлен поставщику.", { orderId }) : t("Заказ №{orderId}: {status}.", { orderId, status: result.dispatch_status }));
            await Promise.all([loadBalance(), loadOrders()]);
        } catch (requestError) { handleRequestError(requestError); }
        finally { setRetryingId(null); }
    }

    function openResolve(order) {
        setResolveOrder(order);
        setSupplierOrderId("");
        setError("");
        setNotice("");
    }

    async function handleResolve(resolution, supplierOrderIdValue) {
        if (!resolveOrder) return;
        try {
            setResolving(true); setError(""); setNotice("");
            const result = await adminRequest(`/api/admin/orders/${resolveOrder.id}/resolve-dispatch`, {
                method: "POST",
                body: JSON.stringify({ resolution, supplier_order_id: supplierOrderIdValue ?? null }),
            });
            setNotice(result.dispatch_status === "recorded"
                ? t("Заказ №{orderId}: внешний ID зафиксирован.", { orderId: resolveOrder.id })
                : t("Заказ №{orderId} отправлен заново: {status}.", { orderId: resolveOrder.id, status: result.dispatch_status }));
            setResolveOrder(null);
            setSupplierOrderId("");
            await Promise.all([loadBalance(), loadOrders()]);
        } catch (requestError) { handleRequestError(requestError); }
        finally { setResolving(false); }
    }

    if (loading) return <AppShell active="admin" title={t("Контроль заказов")}><Panel className="admin-message">{t("Проверяем права администратора…")}</Panel></AppShell>;
    if (forbidden) return <AppShell title={t("Админ-панель")}><Panel className="admin-denied"><p className="kp-eyebrow">{t("403 · доступ запрещён")}</p><h1>{t("Админ-панель недоступна")}</h1><p>{t("У текущего аккаунта нет административных прав.")}</p><Link className="kp-button" to="/main">{t("Вернуться в кабинет")}</Link></Panel></AppShell>;

    return (
        <AppShell active="admin" contentClassName="admin-page" title={t("Контроль заказов")}>
            <PageHeader eyebrow={t("Операционный центр")} description={t("Рабочий баланс поставщика и оплаченные заказы, которые требуют внимания.")} actions={<><Link className="kp-button kp-button--secondary" to="/admin/support">{t("Поддержка")}</Link><button className="kp-button kp-button--secondary" type="button" onClick={handleRefresh} disabled={refreshing}>{refreshing ? t("Обновляем…") : t("Обновить")}</button></>} />
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <section className="admin-stats">
                <Panel className="admin-balance"><span>{t("Баланс поставщика")}</span><strong>{balance ? `${formatMoney(balance.balance)} ${balance.currency}` : "—"}</strong><small>{t("Проверено {time}", { time: balance?.checked_at ? new Date(balance.checked_at).toLocaleTimeString("ru-RU") : "—" })}</small></Panel>
                <Panel><span>{t("Ожидают отправки")}</span><strong>{counts.awaiting}</strong></Panel>
                <Panel><span>{t("Не хватает средств")}</span><strong>{counts.insufficient}</strong></Panel>
                <Panel><span>{t("Ручная проверка")}</span><strong>{counts.review}</strong></Panel>
            </section>

            <Panel className="admin-orders">
                <div className="admin-section-head"><div><p className="kp-eyebrow">{t("Очередь внимания")}</p><h2>{t("Оплаченные заказы")}</h2></div><span>{orders.length}</span></div>
                {orders.length === 0 ? <EmptyState>{t("Все оплаченные заказы обработаны.")}</EmptyState> : (
                    <div className="admin-orders-list">
                        {orders.map((order) => (
                            <article key={order.id}>
                                <div className="admin-order-main"><small>{t("Заказ №{id} · услуга #{serviceId}", { id: order.id, serviceId: order.service_id })}</small><strong>{t(attentionLabels[order.attention_kind] || "Требует внимания")}</strong><p>{t("{qty} шт. · клиент оплатил {amount} ₽", { qty: Number(order.quantity).toLocaleString("ru-RU"), amount: formatMoney(order.public_amount) })}{order.supplier_cost ? t(" · поставщику {amount} ₽", { amount: formatMoney(order.supplier_cost) }) : ""}</p></div>
                                <StatusBadge status={order.dispatch_status}>{order.status}</StatusBadge>
                                {order.can_retry ? <button className="kp-button kp-button--small" type="button" disabled={retryingId === order.id} onClick={() => handleRetry(order.id)}>{retryingId === order.id ? t("Отправляем…") : t("Повторить")}</button> : order.can_resolve ? <button className="kp-button kp-button--small" type="button" onClick={() => openResolve(order)}>{t("Разрешить ситуацию")}</button> : <span className="admin-review-note">{t("Повтор запрещён до ручной проверки")}</span>}
                            </article>
                        ))}
                    </div>
                )}
            </Panel>

            {resolveOrder && (
                <div className="admin-modal" role="dialog" aria-modal="true" aria-label={t("Разрешить ситуацию")}>
                    <div className="admin-modal-backdrop" onClick={() => !resolving && setResolveOrder(null)} />
                    <div className="admin-modal-card">
                        <h2>{t("Разрешить ситуацию")}</h2>
                        <p className="admin-modal-warn">{t("Перед выбором проверьте панель поставщика!")}</p>
                        <dl className="admin-modal-facts">
                            <div><dt>{t("Заказ")}</dt><dd>#{resolveOrder.id}</dd></div>
                            <div><dt>{t("Ссылка")}</dt><dd>{resolveOrder.link}</dd></div>
                            <div><dt>{t("Количество")}</dt><dd>{Number(resolveOrder.quantity).toLocaleString("ru-RU")}</dd></div>
                            <div><dt>{t("Сумма")}</dt><dd>{formatMoney(resolveOrder.public_amount)} ₽</dd></div>
                        </dl>
                        <div className="admin-modal-actions">
                            <button className="kp-button kp-button--danger" type="button" disabled={resolving} onClick={() => handleResolve("not_created")}>{t("Заказ не создан")}</button>
                            <div className="admin-modal-record">
                                <input className="kp-field" type="number" min="1" placeholder={t("ID заказа у поставщика")} value={supplierOrderId} onChange={(event) => setSupplierOrderId(event.target.value)} disabled={resolving} />
                                <button className="kp-button" type="button" disabled={resolving || !supplierOrderId} onClick={() => handleResolve("record_order", Number(supplierOrderId))}>{t("Заказ создан")}</button>
                            </div>
                            <button className="kp-button kp-button--secondary" type="button" disabled={resolving} onClick={() => setResolveOrder(null)}>{t("Отмена")}</button>
                        </div>
                    </div>
                </div>
            )}
        </AppShell>
    );
}
