import { useCallback, useEffect, useState } from "react";

import { adminApi } from "./adminApi";
import LineChart from "./components/Chart";
import PeriodPicker, { periodParams } from "./components/PeriodPicker";
import { formatNumber } from "./format";
import "./AdminPanel.css";

/* Человеческие названия страниц для таблицы «Страницы за период». */
const PATH_LABELS = {
    "/": "Главная страница",
    "/catalog": "Каталог услуг",
    "/main": "Личный кабинет",
    "/account": "Настройки аккаунта",
    "/reviews": "Отзывы",
    "/support": "Поддержка",
    "/payment/pending": "Оплата",
    "/payment/success": "Оплата (успех)",
};

function pathLabel(path) {
    return PATH_LABELS[path] || path;
}

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

    const totals = traffic?.totals || {};
    const series = traffic?.series || [];
    const paths = traffic?.paths || [];
    const usersSeries = users?.series || [];

    const pointsFor = (field) => series.map((point) => ({ ts: point.ts, value: point[field] }));

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
                            <p className="admin-card-label">Перешли на главную</p>
                            <p className="admin-card-value">{formatNumber(totals.landing_pageviews)}</p>
                            <p className="admin-card-sub">
                                просмотры главной страницы за период
                                <br />
                                уникальных посетителей: {formatNumber(totals.landing_uniques)}
                            </p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Новые посетители</p>
                            <p className="admin-card-value">{formatNumber(totals.new_visitors)}</p>
                            <p className="admin-card-sub">
                                первый визит пришёлся на период
                                <br />
                                из них сразу на главную: {formatNumber(totals.new_landing_visitors)}
                            </p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Входы в аккаунт</p>
                            <p className="admin-card-value">{formatNumber(totals.logins)}</p>
                            <p className="admin-card-sub">
                                успешных входов (логин, Telegram, VK)
                                <br />
                                уникальных пользователей: {formatNumber(totals.unique_logins)}
                            </p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Регистрации</p>
                            <p className="admin-card-value">{formatNumber(totals.registrations)}</p>
                            <p className="admin-card-sub">
                                новых аккаунтов за период (события)
                                <br />
                                всего пользователей: {formatNumber(users?.total_users)}
                            </p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Просмотры всех страниц</p>
                            <p className="admin-card-value">{formatNumber(totals.pageviews)}</p>
                            <p className="admin-card-sub">
                                без страниц админ-панели
                                <br />
                                уникальных: {formatNumber(totals.unique_visitors)} · авторизованных: {formatNumber(totals.logged_in_users)}
                            </p>
                        </div>
                        <div className="admin-card">
                            <p className="admin-card-label">Активные пользователи</p>
                            <p className="admin-card-value">{formatNumber(users?.active_users)}</p>
                            <p className="admin-card-sub">
                                заходили на сайт за последние {formatNumber(users?.active_users_window_minutes || 30)} мин
                            </p>
                        </div>
                    </section>

                    <div className="admin-charts-grid">
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Главная страница</p>
                                    <h2>Переходы на главную</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={traffic?.bucket}
                                series={[
                                    { name: "Просмотры главной", points: pointsFor("landing_pageviews") },
                                    { name: "Уникальные на главной", points: pointsFor("landing_uniques"), color: "#7aa2ff" },
                                ]}
                            />
                        </section>
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Аккаунты</p>
                                    <h2>Входы и регистрации</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={traffic?.bucket}
                                series={[
                                    { name: "Входы", points: pointsFor("logins") },
                                    { name: "Уникальные вошедшие", points: pointsFor("unique_logins"), color: "#7aa2ff" },
                                    { name: "Регистрации", points: pointsFor("registrations"), color: "#52d378" },
                                ]}
                            />
                        </section>
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Трафик</p>
                                    <h2>Просмотры всех страниц сайта</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={traffic?.bucket}
                                series={[
                                    { name: "Просмотры", points: pointsFor("pageviews") },
                                    { name: "Уникальные", points: pointsFor("unique_visitors"), color: "#7aa2ff" },
                                    { name: "Авторизованные", points: pointsFor("logged_in_users"), color: "#52d378" },
                                ]}
                            />
                        </section>
                        <section className="admin-panel">
                            <div className="admin-section-head">
                                <div>
                                    <p className="kp-eyebrow">Пользователи</p>
                                    <h2>Регистрации по аккаунтам</h2>
                                </div>
                            </div>
                            <LineChart
                                bucket={users?.bucket}
                                series={[
                                    {
                                        name: "Новые аккаунты",
                                        points: usersSeries.map((point) => ({ ts: point.ts, value: point.registrations })),
                                    },
                                    {
                                        name: "Всего пользователей",
                                        points: usersSeries.map((point) => ({ ts: point.ts, value: point.total_users })),
                                        color: "#7aa2ff",
                                    },
                                ]}
                            />
                        </section>
                    </div>

                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Страницы</p>
                                <h2>Посещения по страницам за период</h2>
                            </div>
                        </div>
                        {paths.length === 0 ? (
                            <div className="admin-empty">За выбранный период посещений не было.</div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Страница</th>
                                            <th>Путь</th>
                                            <th>Просмотры</th>
                                            <th>Уникальные</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paths.map((item) => (
                                            <tr key={item.path}>
                                                <td>{pathLabel(item.path)}</td>
                                                <td className="admin-cell-muted">{item.path}</td>
                                                <td>{formatNumber(item.pageviews)}</td>
                                                <td>{formatNumber(item.unique_visitors)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="admin-cell-muted" style={{ fontSize: 11.5, margin: "14px 0 0", lineHeight: 1.6 }}>
                            Просмотры главной страницы — переходы на «/» (лендинг). Входы и регистрации пишет сам backend
                            в момент успешной операции (логин/пароль, Telegram, VK) — подделать из браузера их нельзя. Учёт
                            входов и регистраций ведётся с момента включения этих событий; страницы админ-панели в статистику
                            сайта не входят. Персональные данные не хранятся: только HMAC анонимного visitor-идентификатора.
                        </p>
                    </section>
                </>
            )}
        </>
    );
}
