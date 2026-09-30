import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "./adminApi";
import LineChart from "./components/Chart";
import ConfirmModal from "./components/ConfirmModal";
import { formatMoney, formatNumber } from "./format";
import "./AdminPanel.css";

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

function ChartCard({ title, period, setPeriod, loading, data, series }) {
    return (
        <section className="admin-panel">
            <div className="admin-section-head">
                <div>
                    <h2>{title}</h2>
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

    const [revenuePeriod, setRevenuePeriod] = useState("7d");
    const [usersPeriod, setUsersPeriod] = useState("30d");
    const [trafficPeriod, setTrafficPeriod] = useState("7d");
    const [revenue, setRevenue] = useState(null);
    const [usersStats, setUsersStats] = useState(null);
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
            const [revenueData, usersData, trafficData] = await Promise.all([
                adminApi.revenueStats({ period: revenuePeriod }),
                adminApi.usersStats({ period: usersPeriod }),
                adminApi.trafficStats({ period: trafficPeriod }),
            ]);
            setRevenue(revenueData);
            setUsersStats(usersData);
            setTraffic(trafficData);
        } finally {
            setChartsLoading(false);
        }
    }, [revenuePeriod, usersPeriod, trafficPeriod]);

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

    const revenueSeries = useMemo(() => {
        if (!revenue?.series) return [];
        const profitPoints = [];
        for (const point of revenue.series) {
            const cost = Number(point.cost || 0);
            profitPoints.push({
                ts: point.ts,
                value: Math.max(0, Number(point.revenue) - cost),
            });
        }
        return [
            { name: "Оборот", points: revenue.series.map((point) => ({ ts: point.ts, value: point.revenue })) },
            { name: "Себестоимость", points: revenue.series.map((point) => ({ ts: point.ts, value: point.cost })) },
            {
                name: "Прибыль (по заказам с себестоимостью)",
                points: profitPoints,
                color: "#52d378",
            },
        ];
    }, [revenue]);

    const usersSeries = useMemo(() => {
        if (!usersStats?.series) return [];
        return [
            {
                name: "Регистрации",
                points: usersStats.series.map((point) => ({ ts: point.ts, value: point.registrations })),
            },
            {
                name: "Всего пользователей",
                points: usersStats.series.map((point) => ({ ts: point.ts, value: point.total_users })),
                color: "#7aa2ff",
            },
        ];
    }, [usersStats]);

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

            <section className="admin-cards">
                <div className="admin-card">
                    <p className="admin-card-label">Пользователи</p>
                    <p className="admin-card-value">{formatNumber(d.users.total)}</p>
                    <p className="admin-card-sub">
                        новых сегодня: {formatNumber(d.users.new_today)} · за неделю: {formatNumber(d.users.new_week)}
                        <br />
                        активных ({d.active_users_window_minutes} мин): {formatNumber(d.users.active)}
                    </p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Заказы</p>
                    <p className="admin-card-value">{formatNumber(d.orders.total)}</p>
                    <p className="admin-card-sub">
                        сегодня: {formatNumber(d.orders.today)} · в работе: {formatNumber(d.orders.active)}
                    </p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Оборот заказов</p>
                    <p className="admin-card-value">{formatMoney(d.revenue.total)}</p>
                    <p className="admin-card-sub">
                        сегодня: {formatMoney(d.revenue.today)} · неделя: {formatMoney(d.revenue.week)}
                        <br />
                        месяц: {formatMoney(d.revenue.month)}
                    </p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Поддержка</p>
                    <p className="admin-card-value">{formatNumber(d.support.open)}</p>
                    <p className="admin-card-sub">
                        новых: {formatNumber(d.support.new)} · всего: {formatNumber(d.support.total)}
                    </p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Отзывы</p>
                    <p className="admin-card-value">{formatNumber(d.reviews_total)}</p>
                    <p className="admin-card-sub">активных (не удалённых)</p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Посещения сегодня</p>
                    <p className="admin-card-value">{formatNumber(d.traffic.pageviews_today)}</p>
                    <p className="admin-card-sub">
                        уникальных: {formatNumber(d.traffic.uniques_today)} · авторизованных: {formatNumber(d.traffic.logged_in_today)}
                        <br />
                        неделя: {formatNumber(d.traffic.pageviews_week)} · месяц: {formatNumber(d.traffic.pageviews_month)}
                    </p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Глобальная наценка</p>
                    <p className="admin-card-value">{d.markup_percent || "—"}<small>%</small></p>
                    <p className="admin-card-sub">применяется к новым ценам каталога</p>
                </div>
                <div className="admin-card">
                    <p className="admin-card-label">Баланс поставщика</p>
                    <p className="admin-card-value">
                        {balanceError ? <span style={{ fontSize: 20, color: "var(--kp-text-muted)" }}>недоступен</span> : balance ? formatMoney(balance.balance) : "…"}
                        {balance && !balanceError ? <small> {balance.currency}</small> : null}
                    </p>
                    <p className="admin-card-sub">
                        {balance && !balanceError
                            ? `проверено ${new Date(balance.checked_at).toLocaleTimeString("ru-RU")}`
                            : "API поставщика недоступен или не настроен"}
                    </p>
                </div>
            </section>

            <div className="admin-charts-grid">
                <ChartCard
                    title="Доход и себестоимость"
                    period={revenuePeriod}
                    setPeriod={setRevenuePeriod}
                    loading={chartsLoading}
                    data={revenue}
                    series={revenueSeries}
                />
                <ChartCard
                    title="Регистрации пользователей"
                    period={usersPeriod}
                    setPeriod={setUsersPeriod}
                    loading={chartsLoading}
                    data={usersStats}
                    series={usersSeries}
                />
                <ChartCard
                    title="Посещения сайта"
                    period={trafficPeriod}
                    setPeriod={setTrafficPeriod}
                    loading={chartsLoading}
                    data={traffic}
                    series={trafficSeries}
                />
            </div>

            <section className="admin-panel">
                <div className="admin-section-head">
                    <div>
                        <h2>Оплаченные заказы, требующие внимания</h2>
                        <p>
                            Ожидают отправки: {attentionCounts.awaiting} · Не хватает средств: {attentionCounts.insufficient} ·
                            Ручная проверка: {attentionCounts.review}
                        </p>
                    </div>
                    <span className="admin-badge admin-badge--neutral">{attention.length}</span>
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
