import { useCallback, useEffect, useState } from "react";

import { adminApi } from "./adminApi";
import LineChart from "./components/Chart";
import PeriodPicker, { periodParams } from "./components/PeriodPicker";
import { formatNumber } from "./format";
import "./AdminPanel.css";

export default function AnalyticsAdmin() {
    const [period, setPeriod] = useState({ period: "7d" });
    const [traffic, setTraffic] = useState(null);
    const [users, setUsers] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const params = periodParams(period);

    const load = useCallback(async () => {
        if (!params) return;
        setLoading(true);
        setError("");
        try {
            const [trafficData, usersData] = await Promise.all([
                adminApi.trafficStats(params),
                adminApi.usersStats(params),
            ]);
            setTraffic(trafficData);
            setUsers(usersData);
        } catch (requestError) {
            setError(requestError.message || "Не удалось загрузить аналитику");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params)]);

    useEffect(() => {
        load();
    }, [load]);

    const trafficTotals = (traffic?.series || []).reduce(
        (acc, point) => ({
            pageviews: acc.pageviews + point.pageviews,
            uniques: acc.uniques + point.unique_visitors,
            loggedIn: acc.loggedIn + point.logged_in_users,
        }),
        { pageviews: 0, uniques: 0, loggedIn: 0 }
    );

    const newUsers = (users?.series || []).reduce((sum, point) => sum + point.registrations, 0);

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}

            <section className="admin-panel">
                <PeriodPicker value={period} onChange={setPeriod} />
            </section>

            {!params ? (
                <div className="admin-empty">Для произвольного периода выберите обе даты.</div>
            ) : loading ? (
                <div className="admin-loading">Загружаем аналитику…</div>
            ) : (
                <>
                    <section className="admin-cards">
                        <div className="admin-card">
                            <p className="admin-card-label">Просмотры страниц</p>
                            <p className="admin-card-value">{formatNumber(trafficTotals.pageviews)}</p>
                            <p className="admin-card-sub">page views за период</p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Уникальные посетители</p>
                            <p className="admin-card-value">{formatNumber(trafficTotals.uniques)}</p>
                            <p className="admin-card-sub">по анонимному visitor-хешу (HMAC)</p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Авторизованные</p>
                            <p className="admin-card-value">{formatNumber(trafficTotals.loggedIn)}</p>
                            <p className="admin-card-sub">посетители, вошедшие в аккаунт</p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Новых пользователей</p>
                            <p className="admin-card-value">{formatNumber(newUsers)}</p>
                            <p className="admin-card-sub">
                                всего: {formatNumber(users?.total_users)} · активных: {formatNumber(users?.active_users)}
                            </p>
                        </div>
                    </section>

                    <div className="admin-charts-grid">
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Посещения</p>
                                    <h2>Просмотры и уникальные посетители</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={traffic?.bucket}
                                series={[
                                    {
                                        name: "Просмотры",
                                        points: (traffic?.series || []).map((point) => ({ ts: point.ts, value: point.pageviews })),
                                    },
                                    {
                                        name: "Уникальные",
                                        points: (traffic?.series || []).map((point) => ({ ts: point.ts, value: point.unique_visitors })),
                                        color: "#7aa2ff",
                                    },
                                    {
                                        name: "Авторизованные",
                                        points: (traffic?.series || []).map((point) => ({ ts: point.ts, value: point.logged_in_users })),
                                        color: "#52d378",
                                    },
                                ]}
                            />
                        </section>
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Пользователи</p>
                                    <h2>Регистрации и общее число</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={users?.bucket}
                                series={[
                                    {
                                        name: "Регистрации",
                                        points: (users?.series || []).map((point) => ({ ts: point.ts, value: point.registrations })),
                                    },
                                    {
                                        name: "Всего пользователей",
                                        points: (users?.series || []).map((point) => ({ ts: point.ts, value: point.total_users })),
                                        color: "#7aa2ff",
                                    },
                                ]}
                            />
                        </section>
                    </div>

                    <p className="admin-cell-muted" style={{ fontSize: 11.5 }}>
                        Аналитика собирается минимальными событиями «открытие страницы»: без трекинга мыши и персональных данных.
                        Данные о регистрациях до введения панели восстановлены по первым заказам (приблизительно).
                    </p>
                </>
            )}
        </>
    );
}
