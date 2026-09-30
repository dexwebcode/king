import { useCallback, useEffect, useState } from "react";

import { adminApi } from "./adminApi";
import "./AdminPanel.css";

export default function MarkupAdmin() {
    const [settings, setSettings] = useState(null);
    const [markup, setMarkup] = useState("");
    const [windowMinutes, setWindowMinutes] = useState("");
    const [markupBusy, setMarkupBusy] = useState(false);
    const [windowBusy, setWindowBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        setError("");
        try {
            const data = await adminApi.settings();
            setSettings(data);
            setMarkup(String(data.markup_percent || ""));
            setWindowMinutes(String(data.active_users_window_minutes || 30));
        } catch (requestError) {
            setError(requestError.message || "Не удалось загрузить настройки");
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function saveMarkup() {
        setMarkupBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await adminApi.setMarkup(markup);
            setNotice(`Глобальная наценка сохранена: ${result.markup_percent}%.`);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось сохранить наценку");
        } finally {
            setMarkupBusy(false);
        }
    }

    async function saveWindow() {
        setWindowBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await adminApi.setActiveWindow(windowMinutes);
            setNotice(`Период активности сохранён: ${result.active_users_window_minutes} минут.`);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось сохранить период активности");
        } finally {
            setWindowBusy(false);
        }
    }

    return (
        <>
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-detail-grid">
                <section className="admin-panel">
                    <div className="admin-section-head">
                        <div>
                            <p className="kp-eyebrow">Ценообразование</p>
                            <h2>Глобальная наценка</h2>
                        </div>
                        <span className="admin-badge admin-badge--neutral">
                            Текущая: {settings?.markup_percent || "—"}%
                        </span>
                    </div>
                    <p className="admin-cell-muted" style={{ margin: "0 0 16px", lineHeight: 1.6 }}>
                        Одно централизованное значение на все услуги. Публичная цена рассчитывается по формуле{" "}
                        <code>provider_price × (1 + markup / 100)</code> в едином месте (backend/services/get_price.py).
                        Значение хранится в таблице app_settings и не дублируется у каждой услуги.
                    </p>
                    <div className="admin-filters" style={{ marginBottom: 0 }}>
                        <input
                            className="kp-field"
                            type="number"
                            min="0"
                            max="1000"
                            step="0.01"
                            placeholder="Новая наценка, %"
                            value={markup}
                            onChange={(event) => setMarkup(event.target.value)}
                            aria-label="Новая наценка, %"
                        />
                        <button
                            className="kp-button kp-button--small"
                            type="button"
                            disabled={markupBusy || markup === ""}
                            onClick={saveMarkup}
                        >
                            {markupBusy ? "Сохраняем…" : "Сохранить"}
                        </button>
                    </div>
                    <p className="admin-cell-muted" style={{ fontSize: 11.5, margin: "14px 0 0" }}>
                        Изменение влияет только на формирование НОВЫХ цен. Цена уже созданных заказов хранится в
                        orders.amount и исторически не пересчитывается.
                    </p>
                </section>

                <section className="admin-panel">
                    <div className="admin-section-head">
                        <div>
                            <p className="kp-eyebrow">Активность</p>
                            <h2>Период активности</h2>
                        </div>
                        <span className="admin-badge admin-badge--neutral">
                            Сейчас: {settings?.active_users_window_minutes || "—"} мин
                        </span>
                    </div>
                    <p className="admin-cell-muted" style={{ margin: "0 0 16px", lineHeight: 1.6 }}>
                        Пользователь считается «активным», если заходил на сайт в течение этого окна.
                        Активность записывается не чаще раза в 5 минут при обычной работе с сайтом.
                    </p>
                    <div className="admin-filters" style={{ marginBottom: 0 }}>
                        <input
                            className="kp-field"
                            type="number"
                            min="5"
                            max="525600"
                            step="5"
                            placeholder="Минуты"
                            value={windowMinutes}
                            onChange={(event) => setWindowMinutes(event.target.value)}
                            aria-label="Период активности, минут"
                        />
                        <button
                            className="kp-button kp-button--secondary kp-button--small"
                            type="button"
                            disabled={windowBusy || windowMinutes === ""}
                            onClick={saveWindow}
                        >
                            {windowBusy ? "Сохраняем…" : "Сохранить"}
                        </button>
                    </div>
                </section>
            </div>
        </>
    );
}
