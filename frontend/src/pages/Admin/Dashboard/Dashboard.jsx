import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { adminApi } from "../adminApi";
import LineChart from "../components/Chart/Chart";
import ConfirmModal from "../components/ConfirmModal/ConfirmModal";
import { formatMoney, formatNumber } from "../format";
import "./Dashboard.css";
import "../AdminApp/AdminApp.css";

const ATTENTION_LABELS = {
    awaiting_dispatch: "Ожидает отправки",
    insufficient_supplier_balance: "Недостаточно средств",
    supplier_unavailable: "Поставщик недоступен",
    manual_review: "Ручная проверка",
};

const CHART_PERIODS = [
    { value: "today", label: "День" },
    { value: "7d", label: "Неделя" },
    { value: "30d", label: "Месяц" },
];

function ChartCard({ title, to, period, setPeriod, loading, data, series }) {
    return (
        <section className="admin-panel">
            <div className="admin-section-head">
                <div>
                    <h2>{title}</h2>
                    {to ? <Link className="admin-section-link" to={to}>Подробнее →</Link> : null}
                </div>
                <div className="admin-period-tabs">
                    {CHART_PERIODS.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            className={period === item.value ? "is-active" : ""}
                            onClick={() => setPeriod(item.value)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="admin-loading">Загружаем график…</div>
            ) : (
                <LineChart series={series} bucket={data?.bucket} />
            )}
        </section>
    );
}

export default function Dashboard() {
    const [dashboard, setDashboard] = useState(null);
    const [balance, setBalance] = useState(null);
    const [balanceError, setBalanceError] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    const [trafficPeriod, setTrafficPeriod] = useState("7d");
    const [traffic, setTraffic] = useState(null);
    const [chartsLoading, setChartsLoading] = useState(true);

    const [attention, setAttention] = useState([]);
    const [attentionLoading, setAttentionLoading] = useState(true);
    const [retryingId, setRetryingId] = useState(null);
    const [notice, setNotice] = useState("");
    const [resolveOrder, setResolveOrder] = useState(null);
    const [supplierOrderId, setSupplierOrderId] = useState("");
    const [resolving, setResolving] = useState(false);

    const loadDashboard = useCallback(async () => {
        const data = await adminApi.dashboard();
        setDashboard(data);
    }, []);

    const loadCharts = useCallback(async () => {
        setChartsLoading(true);
        try {
            const trafficData = await adminApi.trafficStats({ period: trafficPeriod });
            setTraffic(trafficData);
        } finally {
            setChartsLoading(false);
        }
    }, [trafficPeriod]);

    const loadAttention = useCallback(async () => {
        const data = await adminApi.attentionOrders();
        setAttention(Array.isArray(data?.items) ? data.items : []);
    }, []);

    const loadBalance = useCallback(async () => {
        try {
            const data = await adminApi.supplierBalance();
            setBalance(data);
            setBalanceError(false);
        } catch (requestError) {
            setBalanceError(true);
            setBalance(null);
        }
    }, []);

    useEffect(() => {
        let active = true;
        Promise.all([loadDashboard(), loadCharts(), loadAttention(), loadBalance()])
            .catch((requestError) => active && setError(requestError.message || "Не удалось загрузить админ-панель"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [loadDashboard, loadCharts, loadAttention, loadBalance]);

    useEffect(() => {
        loadCharts().catch((requestError) => setError(requestError.message || "Не удалось загрузить графики"));
    }, [loadCharts]);

    const trafficSeries = useMemo(() => {
        if (!traffic?.series) return [];
        return [
            {
                name: "Просмотры",
                points: traffic.series.map((point) => ({ ts: point.ts, value: point.pageviews })),
            },
            {
                name: "Уникальные посетители",
                points: traffic.series.map((point) => ({ ts: point.ts, value: point.unique_visitors })),
                color: "#7aa2ff",
            },
            {
                name: "Авторизованные",
                points: traffic.series.map((point) => ({ ts: point.ts, value: point.logged_in_users })),
                color: "#52d378",
            },
        ];
    }, [traffic]);

    async function handleRetry(orderId) {
        try {
            setRetryingId(orderId);
            setError("");
            setNotice("");
            const result = await adminApi.retryDispatch(orderId);
            setNotice(
                result.dispatch_status === "completed"
                    ? `Заказ №${orderId} отправлен поставщику.`
                    : `Заказ №${orderId}: ${result.dispatch_status}.`
            );
            await Promise.all([loadAttention(), loadBalance()]);
        } catch (requestError) {
            setError(requestError.message || "Ошибка запроса");
        } finally {
            setRetryingId(null);
        }
    }

    async function handleResolve(resolution, supplierOrderIdValue) {
        if (!resolveOrder) return;
        try {
            setResolving(true);
            setError("");
            setNotice("");
            await adminApi.resolveDispatch(resolveOrder.id, {
                resolution,
                supplier_order_id: supplierOrderIdValue ?? null,
            });
            setNotice(`Заказ №${resolveOrder.id}: ситуация разрешена.`);
            setResolveOrder(null);
            setSupplierOrderId("");
            await Promise.all([loadAttention(), loadBalance()]);
        } catch (requestError) {
            setError(requestError.message || "Ошибка запроса");
        } finally {
            setResolving(false);
        }
    }

    const attentionCounts = useMemo(
        () => ({
            awaiting: attention.filter((item) => item.attention_kind === "awaiting_dispatch").length,
            insufficient: attention.filter((item) => item.attention_kind === "insufficient_supplier_balance").length,
            review: attention.filter((item) => ["manual_review", "supplier_unavailable"].includes(item.attention_kind)).length,
        }),
        [attention]
    );

    if (loading) {
        return <div className="admin-loading">Загружаем общую картину…</div>;
    }

    const d = dashboard || { users: {}, orders: {}, revenue: {}, support: {}, traffic: {} };

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-dashboard-top">
            <section className="admin-cards admin-cards--4">
                <Link className="admin-card admin-card--link" to="/admin/users">
                    <p className="admin-card-label">Пользователи</p>
                    <p className="admin-card-value">{formatNumber(d.users.total)}</p>
                    <p className="admin-card-sub">
                        новых сегодня: {formatNumber(d.users.new_today)} · за неделю: {formatNumber(d.users.new_week)} · активных ({d.active_users_window_minutes} мин): {formatNumber(d.users.active)}
                    </p>
                </Link>
                <Link className="admin-card admin-card--link" to="/admin/orders">
                    <p className="admin-card-label">Заказы</p>
                    <p className="admin-card-value">{formatNumber(d.orders.total)}</p>
                    <p className="admin-card-sub">
                        сегодня: {formatNumber(d.orders.today)} · в работе: {formatNumber(d.orders.active)}
                    </p>
                </Link>
                <Link className="admin-card admin-card--link" to="/admin/support">
                    <p className="admin-card-label">Поддержка</p>
                    <p className="admin-card-value">{formatNumber(d.support.open)}</p>
                    <p className="admin-card-sub">
                        новых: {formatNumber(d.support.new)} · всего: {formatNumber(d.support.total)}
                    </p>
                </Link>
                <Link className="admin-card admin-card--link" to="/admin/reviews">
                    <p className="admin-card-label">Отзывы</p>
                    <p className="admin-card-value">{formatNumber(d.reviews_total)}</p>
                    <p className="admin-card-sub">активных (не удалённых)</p>
                </Link>
                <Link className="admin-card admin-card--link" to="/admin/analytics">
                    <p className="admin-card-label">Посещения сайта сегодня</p>
                    <p className="admin-card-value">{formatNumber(d.traffic.pageviews_today)}</p>
                    <p className="admin-card-sub">
                        уникальных: {formatNumber(d.traffic.uniques_today)} · авторизованных: {formatNumber(d.traffic.logged_in_today)} · неделя: {formatNumber(d.traffic.pageviews_week)} · месяц: {formatNumber(d.traffic.pageviews_month)}
                    </p>
                </Link>
                <Link className="admin-card admin-card--link" to="/admin/finance">
                    <p className="admin-card-label">Баланс поставщика</p>
                    <p className="admin-card-value">
                        {balanceError ? <span style={{ fontSize: 22, color: "var(--kp-text-muted)" }}>недоступен</span> : balance ? formatMoney(balance.balance) : "…"}
                        {balance && !balanceError ? <small> {balance.currency}</small> : null}
                    </p>
                    <p className="admin-card-sub">
                        {balance && !balanceError
                            ? `проверено ${new Date(balance.checked_at).toLocaleTimeString("ru-RU")}`
                            : "API поставщика недоступен или не настроен"}
                    </p>
                </Link>
            </section>

                <ChartCard
                    title="Посещения сайта"
                    to="/admin/analytics"
                    period={trafficPeriod}
                    setPeriod={setTrafficPeriod}
                    loading={chartsLoading}
                    data={traffic}
                    series={trafficSeries}
                />
            </div>

            <section className="admin-panel admin-panel--right-bleed">
                <div className="admin-section-head">
                    <div>
                        <h2>Оплаченные заказы, требующие внимания</h2>
                        <p>
                            Ожидают отправки: {attentionCounts.awaiting} · Не хватает средств: {attentionCounts.insufficient} ·
                            Ручная проверка: {attentionCounts.review}
                        </p>
                    </div>
                    <div className="admin-head-actions">
                        <span className="admin-badge admin-badge--neutral">{attention.length}</span>
                        <Link className="admin-section-link" to="/admin/orders">Все заказы →</Link>
                    </div>
                </div>
                {attentionLoading ? (
                    <div className="admin-loading">Загружаем очередь…</div>
                ) : attention.length === 0 ? (
                    <div className="admin-empty">Все оплаченные заказы обработаны.</div>
                ) : (
                    <div className="admin-attention-list">
                        {attention.map((order) => (
                            <article key={order.id}>
                                <div className="admin-attention-main">
                                    <small>Заказ №{order.id} · услуга #{order.service_id}</small>
                                    <strong>{ATTENTION_LABELS[order.attention_kind] || "Требует внимания"}</strong>
                                    <p>
                                        {Number(order.quantity).toLocaleString("ru-RU")} шт. · клиент оплатил {formatMoney(order.public_amount)}
                                        {order.supplier_cost ? ` · поставщику ${formatMoney(order.supplier_cost)}` : ""}
                                    </p>
                                </div>
                                <span className={`kp-status kp-status--${/заверш|выполн/.test(order.dispatch_status) ? "success" : "warning"}`}>
                                    <i />
                                    {order.status}
                                </span>
                                {order.can_retry ? (
                                    <button
                                        className="kp-button kp-button--small"
                                        type="button"
                                        disabled={retryingId === order.id}
                                        onClick={() => handleRetry(order.id)}
                                    >
                                        {retryingId === order.id ? "Отправляем…" : "Повторить"}
                                    </button>
                                ) : order.can_resolve ? (
                                    <button
                                        className="kp-button kp-button--small"
                                        type="button"
                                        onClick={() => {
                                            setResolveOrder(order);
                                            setSupplierOrderId("");
                                        }}
                                    >
                                        Разрешить ситуацию
                                    </button>
                                ) : (
                                    <span className="admin-review-note">Повтор запрещён до ручной проверки</span>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <ConfirmModal
                open={Boolean(resolveOrder)}
                title="Разрешить ситуацию"
                confirmLabel="Заказ не создан"
                busy={resolving}
                onCancel={() => setResolveOrder(null)}
                onConfirm={() => handleResolve("not_created", null)}
            >
                <p>
                    Перед выбором проверьте панель поставщика! Заказ №{resolveOrder?.id} ·{" "}
                    {resolveOrder ? formatMoney(resolveOrder.public_amount) : ""} ·{" "}
                    {resolveOrder?.link}
                </p>
                <div className="admin-modal-body">
                    <input
                        className="kp-field"
                        type="number"
                        min="1"
                        placeholder="ID заказа у поставщика"
                        value={supplierOrderId}
                        onChange={(event) => setSupplierOrderId(event.target.value)}
                        disabled={resolving}
                    />
                </div>
                <div className="admin-modal-actions" style={{ marginTop: 10 }}>
                    <button
                        className="kp-button"
                        type="button"
                        disabled={resolving || !supplierOrderId}
                        onClick={() => handleResolve("record_order", Number(supplierOrderId))}
                    >
                        Заказ создан — зафиксировать ID
                    </button>
                </div>
            </ConfirmModal>
        </>
    );
}
