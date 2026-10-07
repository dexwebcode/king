import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../adminApi";
import LineChart from "../components/Chart/Chart";
import PeriodPicker, { periodParams } from "../components/PeriodPicker/PeriodPicker";
import { formatMoney, formatNumber } from "../format";
import "../AdminApp/AdminApp.css";

export default function FinanceAdmin() {
    const [period, setPeriod] = useState({ period: "30d" });
    const [summary, setSummary] = useState(null);
    const [revenue, setRevenue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const params = periodParams(period);

    const load = useCallback(async () => {
        if (!params) return;
        setLoading(true);
        setError("");
        try {
            const [financeData, revenueData] = await Promise.all([
                adminApi.finance(params),
                adminApi.revenueStats(params),
            ]);
            setSummary(financeData);
            setRevenue(revenueData);
        } catch (requestError) {
            setError(requestError.message || "Не удалось загрузить финансовую статистику");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params)]);

    useEffect(() => {
        load();
    }, [load]);

    const series = [
        {
            name: "Оборот заказов",
            points: (revenue?.series || []).map((point) => ({ ts: point.ts, value: point.revenue })),
        },
        {
            name: "Себестоимость",
            points: (revenue?.series || []).map((point) => ({ ts: point.ts, value: point.cost })),
        },
    ];

    const cards = [
        { label: "Оплаченные заказы", value: formatMoney(summary?.paid_orders_sum), sub: `${formatNumber(summary?.paid_orders_count)} заказов` },
        { label: "Средний чек", value: formatMoney(summary?.avg_check), sub: "по оплаченным заказам" },
        { label: "Пополнения баланса", value: formatMoney(summary?.topups_sum), sub: `${formatNumber(summary?.topups_count)} пополнений` },
        { label: "Возвраты", value: formatMoney(summary?.refunds_sum), sub: "по данным admin-транзакций" },
        { label: "Оборот", value: formatMoney(summary?.turnover), sub: "оплаченные заказы + пополнения" },
        { label: "Выручка", value: formatMoney(summary?.paid_orders_sum), sub: "сумма оплаченных заказов" },
        { label: "Себестоимость", value: formatMoney(summary?.cost_sum), sub: summary?.cost_known_orders ? `известна для ${summary.cost_known_orders} заказов` : "для legacy-заказов не сохранялась" },
        { label: "Прибыль", value: formatMoney(summary?.profit), sub: "выручка − себестоимость" },
        { label: "Маржа", value: summary?.margin_percent !== null && summary?.margin_percent !== undefined ? `${Number(summary.margin_percent).toFixed(1)}%` : "—", sub: "по заказам с известной себестоимостью" },
    ];

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}

            <section className="admin-panel">
                <PeriodPicker value={period} onChange={setPeriod} />
            </section>

            {!params ? (
                <div className="admin-empty">Для произвольного периода выберите обе даты.</div>
            ) : loading ? (
                <div className="admin-loading">Считаем финансовую статистику…</div>
            ) : (
                <>
                    <section className="admin-cards">
                        {cards.map((card) => (
                            <div className="admin-card" key={card.label}>
                                <p className="admin-card-label">{card.label}</p>
                                <p className="admin-card-value">{card.value}</p>
                                <p className="admin-card-sub">{card.sub}</p>
                            </div>
                        ))}
                    </section>

                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Динамика</p>
                                <h2>Оборот и себестоимость по дням</h2>
                            </div>
                        </div>
                        <LineChart series={series} bucket={revenue?.bucket} height={260} />
                        <p className="admin-cell-muted" style={{ fontSize: 11.5, margin: "12px 0 0" }}>
                            Все расчёты выполняются на backend агрегирующими SQL-запросами (COUNT/SUM/GROUP BY/date_trunc).
                            Цены уже созданных заказов не пересчитываются при изменении наценки.
                        </p>
                    </section>
                </>
            )}
        </>
    );
}
