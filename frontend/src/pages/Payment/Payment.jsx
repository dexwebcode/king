import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import "./Payment.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const MAX_STATUS_CHECKS = 30;
const STATUS_CHECK_INTERVAL = 2000;

const statusContent = {
    checking: {
        eyebrow: "Проверяем оплату",
        title: "Получаем статус платежа",
        text: "Это займёт несколько секунд. Не закрывайте страницу.",
    },
    pending: {
        eyebrow: "Платёж обрабатывается",
        title: "Ожидаем подтверждение ЮKassa",
        text: "Если деньги уже списаны, статус обновится после уведомления от платёжной системы.",
    },
    paid: {
        eyebrow: "Оплата подтверждена",
        title: "Заказ успешно оплачен",
        text: "Backend проверил платёж через ЮKassa. Заказ готов к дальнейшей обработке.",
    },
    refunded: {
        eyebrow: "Средства возвращены",
        title: "Заказ не принят поставщиком",
        text: "Оплата подтверждена, а стоимость заказа полностью возвращена на ваш внутренний баланс.",
    },
    review: {
        eyebrow: "Оплата подтверждена",
        title: "Заказ проверяется",
        text: "Мы не получили однозначный ответ поставщика и не отправляем заказ повторно, чтобы избежать дублирования.",
    },
    canceled: {
        eyebrow: "Оплата отменена",
        title: "Платёж не завершён",
        text: "Вернитесь к заказу и создайте новый платёж.",
    },
    error: {
        eyebrow: "Не удалось проверить",
        title: "Статус оплаты недоступен",
        text: "Попробуйте открыть страницу ещё раз или вернитесь к заказу.",
    },
};

export default function Payment() {
    const [paymentStatus, setPaymentStatus] = useState("checking");
    const content = statusContent[paymentStatus];

    useEffect(() => {
        const orderId = localStorage.getItem("pending_order_id");
        const token = localStorage.getItem("token");
        let isActive = true;
        let timeoutId;

        if (!orderId || !token) {
            setPaymentStatus("error");
            return undefined;
        }

        async function checkStatus(attempt) {
            try {
                const response = await fetch(`${API_URL}/api/orders/${orderId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error("Не удалось получить статус заказа");
                }

                const order = await response.json();

                if (!isActive) {
                    return;
                }

                const paymentProcessed = order.payment_status === "processed";

                if (paymentProcessed && order.status === "Отменен") {
                    localStorage.removeItem("pending_order_id");
                    setPaymentStatus("refunded");
                    return;
                }

                if (paymentProcessed && order.status === "Требует проверки") {
                    localStorage.removeItem("pending_order_id");
                    setPaymentStatus("review");
                    return;
                }

                if (paymentProcessed) {
                    localStorage.removeItem("pending_order_id");
                    setPaymentStatus("paid");
                    return;
                }

                if (
                    order.payment_status === "canceled" ||
                    order.status === "Оплата отменена"
                ) {
                    setPaymentStatus("canceled");
                    return;
                }

                setPaymentStatus("pending");

                if (attempt + 1 < MAX_STATUS_CHECKS) {
                    timeoutId = window.setTimeout(
                        () => checkStatus(attempt + 1),
                        STATUS_CHECK_INTERVAL
                    );
                }
            } catch {
                if (!isActive) {
                    return;
                }

                if (attempt + 1 < MAX_STATUS_CHECKS) {
                    timeoutId = window.setTimeout(
                        () => checkStatus(attempt + 1),
                        STATUS_CHECK_INTERVAL
                    );
                } else {
                    setPaymentStatus("error");
                }
            }
        }

        checkStatus(0);

        return () => {
            isActive = false;
            window.clearTimeout(timeoutId);
        };
    }, []);

    return (
        <main className="payment-page">
            <section className={`payment-card payment-card--${paymentStatus}`}>
                <div className="payment-status-mark" aria-hidden="true">
                    {["paid", "refunded"].includes(paymentStatus)
                        ? "✓"
                        : paymentStatus === "canceled" || paymentStatus === "error"
                            ? "!"
                            : "…"}
                </div>
                <p className="payment-eyebrow">{content.eyebrow}</p>
                <h1>{content.title}</h1>
                <p className="payment-status-copy">{content.text}</p>
                <Link className="payment-back" to="/#quick-order">
                    Вернуться к быстрому заказу
                </Link>
            </section>
        </main>
    );
}
