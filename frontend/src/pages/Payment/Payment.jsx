import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, Panel, StatusBadge } from "../../ui/AppShell";
import "./Payment.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_STATUS_CHECKS = 30;
const STATUS_CHECK_INTERVAL = 2000;

const statusContent = {
    checking: ["Проверяем оплату", "Получаем статус платежа", "Это займёт несколько секунд. Не закрывайте страницу."],
    pending: ["Платёж обрабатывается", "Ожидаем подтверждение ЮKassa", "Если деньги уже списаны, статус обновится после уведомления платёжной системы."],
    dispatching: ["Оплата подтверждена", "Передаём заказ поставщику", "Платёж принят. Безопасно проверяем рабочий баланс и создаём заказ."],
    completed: ["Заказ принят", "Заказ передан поставщику", "Создание подтверждено. Текущий статус можно отслеживать в разделе «Мои заказы»."],
    waiting: ["Заказ принят", "Заказ сохранён в очереди", "Оплата подтверждена. Заказ не потерян и будет отправлен после восстановления доступа или пополнения рабочего баланса."],
    review: ["Требуется проверка", "Заказ проверяет администратор", "Оплата подтверждена. Повторная автоматическая отправка остановлена, чтобы исключить дублирование."],
    canceled: ["Оплата отменена", "Платёж не завершён", "Баланс не изменён. Вернитесь к заказу и создайте новый платёж."],
    error: ["Не удалось проверить", "Статус временно недоступен", "Заказ сохранён. Откройте «Мои заказы» или повторите проверку позднее."],
};

export default function Payment() {
    const [pageStatus, setPageStatus] = useState("checking");
    const [orderStatus, setOrderStatus] = useState("");
    const content = statusContent[pageStatus];

    useEffect(() => {
        const orderId = localStorage.getItem("pending_order_id");
        const token = localStorage.getItem("token");
        let active = true;
        let timeoutId;
        if (!orderId || !token) { setPageStatus("error"); return undefined; }

        const schedule = (attempt) => {
            if (attempt + 1 < MAX_STATUS_CHECKS) timeoutId = window.setTimeout(() => checkStatus(attempt + 1), STATUS_CHECK_INTERVAL);
            else setPageStatus("error");
        };

        async function checkStatus(attempt) {
            try {
                const response = await fetch(`${API_URL}/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
                if (!response.ok) throw new Error();
                const order = await response.json();
                if (!active) return;
                setOrderStatus(order.status || "");

                if (order.payment_status === "canceled" || order.status === "Оплата отменена") {
                    localStorage.removeItem("pending_order_id"); setPageStatus("canceled"); return;
                }
                if (order.payment_status !== "processed") { setPageStatus("pending"); schedule(attempt); return; }

                const dispatch = order.dispatch_status || "not_started";
                if (dispatch === "completed") {
                    localStorage.removeItem("pending_order_id"); setPageStatus("completed"); return;
                }
                if (["insufficient_supplier_balance", "supplier_unavailable"].includes(dispatch)) {
                    localStorage.removeItem("pending_order_id"); setPageStatus("waiting"); return;
                }
                if (["unknown", "rejected", "save_failed"].includes(dispatch) || order.status === "Требует проверки") {
                    localStorage.removeItem("pending_order_id"); setPageStatus("review"); return;
                }
                setPageStatus("dispatching");
                schedule(attempt);
            } catch {
                if (active) schedule(attempt);
            }
        }

        checkStatus(0);
        return () => { active = false; window.clearTimeout(timeoutId); };
    }, []);

    return (
        <AppShell active="orders" contentClassName="payment-page">
            <Panel className={`payment-card payment-card--${pageStatus}`}>
                <div className="payment-status-mark" aria-hidden="true">{pageStatus === "completed" ? "✓" : ["canceled", "error"].includes(pageStatus) ? "!" : "…"}</div>
                <p className="kp-eyebrow">{content[0]}</p>
                <h1>{content[1]}</h1>
                <p>{content[2]}</p>
                {orderStatus && <StatusBadge status={orderStatus}>{orderStatus}</StatusBadge>}
                <div className="payment-actions"><Link className="kp-button" to="/main" state={{ section: "orders" }}>Мои заказы</Link><Link className="kp-button kp-button--secondary" to="/catalog">Каталог</Link></div>
            </Panel>
        </AppShell>
    );
}
