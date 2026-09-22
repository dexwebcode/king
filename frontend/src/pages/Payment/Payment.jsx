import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, Panel, StatusBadge } from "../../ui/AppShell";
import "./Payment.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const PENDING_PAYMENT_KEY = "king_pending_payment";
const STATUS_CHECK_INTERVAL = 2000;
const MAX_STATUS_CHECKS = 90;

const statusContent = {
    checking: ["Проверяем оплату", "Получаем статус платежа", "Страница оплаты открыта отдельно. Этот сайт можно оставить открытым."],
    pending: ["Ожидаем оплату", "Платёж ещё не подтверждён", "Завершите оплату в отдельной вкладке. Статус обновится автоматически."],
    dispatching: ["Оплата подтверждена", "Передаём заказ поставщику", "Платёж принят. Заказ готовится к запуску."],
    completed: ["Оплата подтверждена", "Операция завершена", "Результат сохранён в вашем личном кабинете."],
    canceled: ["Оплата остановлена", "Платёж больше не обрабатывается сайтом", "Ссылка удалена из активной попытки, заказ и баланс не изменены."],
    expired: ["Срок оплаты истёк", "Создайте новый платёж", "Эта попытка оплаты больше не активна."],
    review: ["Нужна проверка", "Платёж остановлен", "Провайдер сообщил об оплате после отмены. Операция не выполнена автоматически."],
    error: ["Не удалось проверить", "Статус временно недоступен", "Повторите проверку или вернитесь в личный кабинет."],
};

function readIntent() {
    try {
        const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function errorMessage(payload, fallback) {
    if (typeof payload?.detail === "string") return payload.detail;
    return fallback;
}

export default function Payment() {
    const intent = useMemo(readIntent, []);
    const queryAttempt = new URLSearchParams(window.location.search).get("attempt");
    const attemptId = queryAttempt || intent?.attempt_id;
    const [pageStatus, setPageStatus] = useState("checking");
    const [payment, setPayment] = useState(null);
    const [checkoutUrl, setCheckoutUrl] = useState(intent?.checkout_url || "");
    const [requestError, setRequestError] = useState("");
    const [canceling, setCanceling] = useState(false);
    const content = statusContent[pageStatus] || statusContent.error;

    const checkStatus = useCallback(async () => {
        if (!attemptId) {
            setPageStatus("error");
            setRequestError("Не найден идентификатор платежа");
            return true;
        }
        const token = localStorage.getItem("token");
        const response = await fetch(API_URL + "/api/payment-attempts/" + attemptId, {
            headers: { Authorization: "Bearer " + token },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(data, "Не удалось проверить платёж"));
        setPayment(data);
        if (data.confirmation_url) setCheckoutUrl(data.confirmation_url);
        setRequestError("");

        if (data.status === "processed") {
            if (data.purpose === "order" && !["completed", "insufficient_supplier_balance", "supplier_unavailable", "unknown", "rejected", "save_failed"].includes(data.dispatch_status)) {
                setPageStatus("dispatching");
                return false;
            }
            setPageStatus("completed");
            localStorage.removeItem(PENDING_PAYMENT_KEY);
            localStorage.removeItem("pending_balance_top_up_id");
            localStorage.removeItem("pending_order_id");
            return true;
        }
        if (["cancel_requested", "canceled"].includes(data.status)) {
            setPageStatus("canceled");
            localStorage.removeItem(PENDING_PAYMENT_KEY);
            return true;
        }
        if (["expired", "wrongamount", "failed", "unavailable", "creation_failed", "verification_failed"].includes(data.status)) {
            setPageStatus("expired");
            return true;
        }
        if (data.status === "paid_after_cancel") {
            setPageStatus("review");
            localStorage.removeItem(PENDING_PAYMENT_KEY);
            return true;
        }
        setPageStatus("pending");
        return false;
    }, [attemptId]);

    useEffect(() => {
        let active = true;
        let timeoutId;
        let checks = 0;
        async function poll() {
            try {
                const finished = await checkStatus();
                if (!active || finished) return;
            } catch (error) {
                if (!active) return;
                setRequestError(error.message || "Не удалось проверить платёж");
            }
            checks += 1;
            if (checks >= MAX_STATUS_CHECKS) {
                setPageStatus("error");
                return;
            }
            timeoutId = window.setTimeout(poll, STATUS_CHECK_INTERVAL);
        }
        poll();
        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [checkStatus]);

    function openCheckout() {
        if (!checkoutUrl) return;
        const checkoutWindow = window.open(checkoutUrl, "king-payment-checkout");
        if (checkoutWindow) checkoutWindow.opener = null;
    }

    async function cancelPayment() {
        if (!attemptId || canceling) return;
        setCanceling(true);
        setRequestError("");
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(API_URL + "/api/payment-attempts/" + attemptId + "/cancel", {
                method: "POST",
                headers: { Authorization: "Bearer " + token },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(errorMessage(data, "Не удалось остановить оплату"));
            const checkoutWindow = window.open("", "king-payment-checkout");
            checkoutWindow?.close();
            setPayment(data);
            setCheckoutUrl("");
            setPageStatus("canceled");
            localStorage.removeItem(PENDING_PAYMENT_KEY);
        } catch (error) {
            setRequestError(error.message || "Не удалось остановить оплату");
        } finally {
            setCanceling(false);
        }
    }

    const canCancel = ["checking", "pending", "error"].includes(pageStatus);
    const canOpen = Boolean(checkoutUrl) && canCancel;

    return (
        <AppShell active={payment?.purpose === "balance_topup" ? "balance" : "orders"} contentClassName="payment-page">
            <Panel className={"payment-card payment-card--" + pageStatus}>
                <div className="payment-status-mark" aria-hidden="true">{pageStatus === "completed" ? "✓" : ["canceled", "expired", "review", "error"].includes(pageStatus) ? "!" : "…"}</div>
                <p className="kp-eyebrow">{content[0]}</p>
                <h1>{content[1]}</h1>
                <p>{content[2]}</p>
                {payment?.status && <StatusBadge status={payment.status}>{payment.status}</StatusBadge>}
                {requestError && <p className="payment-error" role="alert">{requestError}</p>}
                <div className="payment-actions payment-actions--stacked">
                    {canOpen && <button className="kp-button" type="button" onClick={openCheckout}>Открыть страницу оплаты</button>}
                    {canCancel && <button className="kp-button kp-button--danger" type="button" onClick={cancelPayment} disabled={canceling}>{canceling ? "Останавливаем…" : "Прекратить оплату"}</button>}
                    <button className="kp-button kp-button--secondary" type="button" onClick={() => checkStatus().catch((error) => setRequestError(error.message))}>Проверить статус</button>
                    <Link className="kp-button kp-button--secondary" to={payment?.purpose === "balance_topup" ? "/main?section=balance" : "/main"} state={payment?.purpose === "order" ? { section: "orders" } : undefined}>Вернуться в кабинет</Link>
                </div>
            </Panel>
        </AppShell>
    );
}
