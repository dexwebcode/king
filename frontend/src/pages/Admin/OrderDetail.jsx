import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi } from "./adminApi";
import ConfirmModal from "./components/ConfirmModal";
import { formatDate, formatDateShort, formatMoney, orderStatusTone } from "./format";
import "./AdminPanel.css";

const MANUAL_STATUSES = ["Ожидает отправки", "Отменен", "Требует проверки", "Отклонен поставщиком"];

export default function OrderDetail() {
    const { orderId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [statusModal, setStatusModal] = useState(false);
    const [newStatus, setNewStatus] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await adminApi.order(orderId);
            setOrder(data);
        } catch (requestError) {
            setError(requestError.message || "Не удалось загрузить заказ");
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        load();
    }, [load]);

    async function changeStatus() {
        if (!order || !newStatus) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await adminApi.orderStatus(order.id, newStatus);
            setNotice(`Статус изменён: ${result.status}`);
            setStatusModal(false);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось изменить статус");
        } finally {
            setBusy(false);
        }
    }

    async function retryDispatch() {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await adminApi.retryDispatch(order.id);
            setNotice(
                result.dispatch_status === "completed"
                    ? "Заказ отправлен поставщику."
                    : `Статус отправки: ${result.dispatch_status}`
            );
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось повторить отправку");
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <div className="admin-loading">Загружаем заказ…</div>;
    if (!order) {
        return (
            <>
                {error && <p className="admin-alert" role="alert">{error}</p>}
                <Link className="admin-back-link" to="/admin/orders">← К списку заказов</Link>
                <div className="admin-empty">Заказ не найден.</div>
            </>
        );
    }

    const paid = order.payment?.status === "processed" || (!order.payment?.attempt_id && !["Ожидает оплаты", "Оплата отменена"].includes(order.status));
    const atSupplier = Boolean(order.supplier_order_id);
    const canManualStatus = paid && !atSupplier;

    return (
        <>
            <Link className="admin-back-link" to="/admin/orders">← К списку заказов</Link>
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-detail-grid">
                <section className="admin-panel">
                    <div className="admin-section-head">
                        <div>
                            <p className="kp-eyebrow">Заказ №{order.id}</p>
                            <h2>{order.status}</h2>
                        </div>
                        <span className={`kp-status kp-status--${orderStatusTone(order.status)}`}>
                            <i />
                            {order.status}
                        </span>
                    </div>
                    <dl className="admin-facts">
                        <div><dt>ID заказа</dt><dd>{order.id}</dd></div>
                        <div><dt>Пользователь</dt><dd><Link className="admin-table-link" to={`/admin/users/${order.user.id}`}>{order.user.login || "—"} (ID {order.user.id})</Link></dd></div>
                        <div><dt>Email</dt><dd>{order.user.email || "—"}</dd></div>
                        <div><dt>Баланс пользователя</dt><dd>{formatMoney(order.user.balance)}</dd></div>
                        <div><dt>Услуга</dt><dd>#{order.service_id}</dd></div>
                        <div><dt>Площадка</dt><dd>{order.platform || "—"}</dd></div>
                        <div><dt>Ссылка</dt><dd><a href={order.link} target="_blank" rel="noreferrer noopener">{order.link}</a></dd></div>
                        <div><dt>Количество</dt><dd>{Number(order.quantity).toLocaleString("ru-RU")}</dd></div>
                        <div><dt>Стоимость</dt><dd>{formatMoney(order.amount)}</dd></div>
                        <div><dt>Себестоимость</dt><dd>{order.supplier_cost ? formatMoney(order.supplier_cost) : "— (снимок не сохранялся для legacy-заказов)"}</dd></div>
                        <div><dt>Остаток / старт</dt><dd>{Number(order.remains).toLocaleString("ru-RU")} / {order.before ? Number(order.before).toLocaleString("ru-RU") : "—"}</dd></div>
                        <div><dt>Внешний ID (id_rocket)</dt><dd>{order.supplier_order_id || "— (у поставщика не создан)"}</dd></div>
                        <div><dt>Создан</dt><dd>{formatDate(order.created_ts || order.created_at)}</dd></div>
                    </dl>
                </section>

                <section className="admin-panel">
                    <div className="admin-section-head">
                        <div>
                            <p className="kp-eyebrow">Платёж</p>
                            <h2>{order.payment?.provider || "—"}</h2>
                        </div>
                    </div>
                    <dl className="admin-facts">
                        <div><dt>Попытка</dt><dd>#{order.payment?.attempt_id || "—"}</dd></div>
                        <div><dt>Статус платежа</dt><dd>{order.payment?.status || "— (legacy-заказ)"}</dd></div>
                        <div><dt>Статус отправки</dt><dd>{order.payment?.dispatch_status || "—"}</dd></div>
                        <div><dt>Обработан</dt><dd>{formatDate(order.payment?.processed_at)}</dd></div>
                        <div><dt>Ошибка платежа</dt><dd>{order.payment?.payment_error || "—"}</dd></div>
                        <div><dt>Ошибка отправки</dt><dd>{order.payment?.dispatch_error || "—"}</dd></div>
                    </dl>

                    <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                        {!atSupplier && order.payment?.status === "processed" && (
                            <button className="kp-button kp-button--secondary kp-button--small" type="button" disabled={busy} onClick={retryDispatch}>
                                Повторить отправку поставщику
                            </button>
                        )}
                        <button
                            className="kp-button kp-button--secondary kp-button--small"
                            type="button"
                            disabled={!canManualStatus || busy}
                            onClick={() => setStatusModal(true)}
                        >
                            Изменить статус вручную
                        </button>
                        {!canManualStatus && (
                            <p className="admin-cell-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                                {atSupplier
                                    ? "Заказ уже отправлен поставщику: статус синхронизируется автоматически."
                                    : "Ручное изменение доступно только для оплаченных заказов, ещё не отправленных поставщику."}
                            </p>
                        )}
                    </div>
                </section>
            </div>

            <ConfirmModal
                open={statusModal}
                title="Изменить статус заказа"
                confirmLabel="Сохранить статус"
                busy={busy}
                onCancel={() => setStatusModal(false)}
                onConfirm={changeStatus}
            >
                <p>
                    Ручное изменение разрешено только для оплаченных заказов, ещё не созданных у поставщика, —
                    чтобы не ломать синхронизацию. Действие попадёт в журнал администратора.
                </p>
                <select
                    className="kp-field admin-select"
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value)}
                >
                    <option value="">Выберите статус…</option>
                    {MANUAL_STATUSES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                    ))}
                </select>
            </ConfirmModal>
        </>
    );
}
