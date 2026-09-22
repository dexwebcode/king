import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Panel } from "../../ui/AppShell";
import { formatMoney } from "../../ui/catalogMeta";
import { availablePaymentMethods } from "./paymentMethods";

const API_URL = import.meta.env.VITE_API_URL || "";
const MIN_TOP_UP = 10;
const MAX_TOP_UP = 100_000;
const STATUS_CHECK_INTERVAL = 2_000;
const MAX_STATUS_CHECKS = 30;
const PENDING_TOP_UP_KEY = "pending_balance_top_up_id";
const QUICK_AMOUNTS = [500, 1_000, 2_500, 5_000];

function getErrorMessage(payload, fallback) {
    if (typeof payload?.detail === "string") return payload.detail;
    if (Array.isArray(payload?.detail)) {
        return payload.detail.map((item) => item?.msg).filter(Boolean).join(". ") || fallback;
    }
    return fallback;
}

function parseAmount(value) {
    const normalized = String(value).trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
}

function validateAmount(value) {
    if (!String(value).trim()) return "Введите сумму пополнения";
    const amount = parseAmount(value);
    if (amount === null) return "Введите корректную сумму, не более двух знаков после запятой";
    if (amount < MIN_TOP_UP || amount > MAX_TOP_UP) {
        return `Допустимая сумма — от ${formatMoney(MIN_TOP_UP)} до ${formatMoney(MAX_TOP_UP)} ₽`;
    }
    return "";
}

function PaymentMethodCard({ method, selected, onSelect }) {
    return (
        <button
            className={`payment-method-card ${selected ? "is-selected" : ""}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(method.id)}
        >
            <span className="payment-method-logo" aria-hidden="true">
                <i /><i /><i />
            </span>
            <span className="payment-method-copy">
                <span className="payment-method-heading">
                    <strong>{method.name}</strong>
                    {method.badge && <small>{method.badge}</small>}
                </span>
                <span>{method.description}</span>
                <em>Платёж обрабатывает {method.provider}</em>
            </span>
            <span className="payment-method-check" aria-hidden="true">✓</span>
        </button>
    );
}

export default function BalanceSection({
    returnedFromPayment = false,
    onBalanceChange,
    onPaymentSettled,
}) {
    const navigate = useNavigate();
    const methods = useMemo(availablePaymentMethods, []);
    const [amount, setAmount] = useState("");
    const [selectedMethod, setSelectedMethod] = useState(methods[0]?.id || "");
    const [fieldError, setFieldError] = useState("");
    const [requestError, setRequestError] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const statusAttempts = useRef(0);
    const idempotenceKey = useRef(crypto.randomUUID());

    useEffect(() => {
        const pendingTopUpId = localStorage.getItem(PENDING_TOP_UP_KEY);
        if (!pendingTopUpId) {
            if (returnedFromPayment) {
                setRequestError("Не удалось найти созданное пополнение. Баланс можно проверить, обновив страницу.");
            }
            return undefined;
        }

        let active = true;
        let timeoutId;
        statusAttempts.current = 0;
        setPaymentStatus("checking");

        async function checkStatus() {
            try {
                const token = localStorage.getItem("token");
                const response = await fetch(`${API_URL}/api/balance/top-ups/${pendingTopUpId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(getErrorMessage(data, "Не удалось проверить пополнение"));
                if (!active) return;

                if (data.status === "processed") {
                    localStorage.removeItem(PENDING_TOP_UP_KEY);
                    setRequestError("");
                    setPaymentStatus("processed");
                    onBalanceChange?.(data.balance);
                    onPaymentSettled?.();
                    return;
                }
                if (data.status === "canceled") {
                    localStorage.removeItem(PENDING_TOP_UP_KEY);
                    setRequestError("");
                    setPaymentStatus("canceled");
                    onPaymentSettled?.();
                    return;
                }
                if (["failed", "unavailable", "wrongamount", "expired"].includes(data.status)) {
                    localStorage.removeItem(PENDING_TOP_UP_KEY);
                    setRequestError("");
                    setPaymentStatus("failed");
                    onPaymentSettled?.();
                    return;
                }

                statusAttempts.current += 1;
                if (statusAttempts.current >= MAX_STATUS_CHECKS) {
                    setPaymentStatus("delayed");
                    return;
                }
                setPaymentStatus("pending");
                timeoutId = window.setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
            } catch (error) {
                if (!active) return;
                statusAttempts.current += 1;
                if (statusAttempts.current >= MAX_STATUS_CHECKS) {
                    setPaymentStatus("delayed");
                    setRequestError(error.message || "Не удалось проверить пополнение");
                    return;
                }
                timeoutId = window.setTimeout(checkStatus, STATUS_CHECK_INTERVAL);
            }
        }

        checkStatus();
        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [onBalanceChange, onPaymentSettled, returnedFromPayment]);

    function handleAmountChange(event) {
        const nextValue = event.target.value.replace(/[^\d.,]/g, "").replace(/([.,].*)[.,]/g, "$1");
        setAmount(nextValue);
        if (fieldError) setFieldError("");
        if (requestError) setRequestError("");
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (isSubmitting) return;

        const validationMessage = validateAmount(amount);
        if (validationMessage) {
            setFieldError(validationMessage);
            return;
        }
        const method = methods.find((item) => item.id === selectedMethod);
        if (!method) {
            setRequestError("Выберите доступный способ оплаты");
            return;
        }

        const checkoutWindow = window.open("about:blank", "king-payment-checkout");
        if (checkoutWindow) checkoutWindow.opener = null;
        setIsSubmitting(true);
        setRequestError("");
        setPaymentStatus("");
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_URL}${method.endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    amount: parseAmount(amount).toFixed(2),
                    payment_method: method.apiValue,
                    idempotence_key: idempotenceKey.current,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(getErrorMessage(data, "Не удалось создать платёж"));
            const topUpId = data?.top_up_id;
            const attemptId = data?.attempt_id;
            const checkoutUrl = data?.confirmation_url;
            if (!topUpId || !attemptId || !checkoutUrl) {
                throw new Error("Платёж создан без ссылки для перехода в банк");
            }
            localStorage.setItem(PENDING_TOP_UP_KEY, String(topUpId));
            localStorage.setItem("king_pending_payment", JSON.stringify({
                attempt_id: attemptId,
                purpose: "balance_topup",
                provider: data.provider || method.id,
                checkout_url: checkoutUrl,
                top_up_id: topUpId,
            }));
            if (checkoutWindow) checkoutWindow.location.replace(checkoutUrl);
            navigate("/payment/pending?attempt=" + attemptId);
        } catch (error) {
            checkoutWindow?.close();
            setRequestError(error.message || "Не удалось создать платёж. Попробуйте ещё раз.");
            setIsSubmitting(false);
        }
    }

    const statusMessages = {
        checking: "Проверяем статус пополнения…",
        pending: "Платёж обрабатывается. Баланс обновится после подтверждения платёжной системой.",
        processed: "Баланс успешно пополнен.",
        canceled: "Платёж отменён. Баланс не изменён.",
        failed: "Платёж не завершён. Баланс не изменён.",
        delayed: "Подтверждение занимает больше времени. Баланс обновится автоматически после уведомления платёжной системы.",
    };

    return (
        <Panel className="top-up-panel">
                <div className="top-up-heading">
                    <div>
                        <p className="kp-eyebrow">Пополнение</p>
                        <h2>Пополнить баланс</h2>
                    </div>
                    <span>Безопасная оплата</span>
                </div>

                {paymentStatus && (
                    <div className={`top-up-status top-up-status--${paymentStatus}`} role="status">
                        <i />{statusMessages[paymentStatus]}
                    </div>
                )}

                <form className="top-up-form" onSubmit={handleSubmit} noValidate>
                    <div className="amount-field-group">
                        <label htmlFor="top-up-amount">Сумма пополнения</label>
                        <div className={`amount-field ${fieldError ? "has-error" : ""}`}>
                            <input
                                id="top-up-amount"
                                value={amount}
                                onChange={handleAmountChange}
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="1 000"
                                aria-invalid={Boolean(fieldError)}
                                aria-describedby={fieldError ? "top-up-amount-error" : "top-up-amount-hint"}
                            />
                            <span>₽</span>
                        </div>
                        {fieldError ? (
                            <small className="top-up-error" id="top-up-amount-error">{fieldError}</small>
                        ) : (
                            <small id="top-up-amount-hint">От 10 до 100 000 ₽</small>
                        )}
                        <div className="quick-amounts" aria-label="Быстрый выбор суммы">
                            {QUICK_AMOUNTS.map((quickAmount) => (
                                <button
                                    className={parseAmount(amount) === quickAmount ? "is-active" : ""}
                                    type="button"
                                    key={quickAmount}
                                    onClick={() => {
                                        setAmount(String(quickAmount));
                                        setFieldError("");
                                    }}
                                >
                                    {formatMoney(quickAmount)} ₽
                                </button>
                            ))}
                        </div>
                    </div>

                    <fieldset className="payment-methods">
                        <legend>Способ оплаты</legend>
                        <div className="payment-method-list" role="radiogroup" aria-label="Способ оплаты">
                            {methods.map((method) => (
                                <PaymentMethodCard
                                    key={method.id}
                                    method={method}
                                    selected={selectedMethod === method.id}
                                    onSelect={setSelectedMethod}
                                />
                            ))}
                        </div>
                    </fieldset>

                    {requestError && <p className="top-up-request-error" role="alert">{requestError}</p>}

                    <button className="kp-button top-up-submit" type="submit" disabled={isSubmitting || methods.length === 0}>
                        {isSubmitting ? "Создаём платёж…" : "Перейти к оплате"}
                        {!isSubmitting && <span aria-hidden="true">→</span>}
                    </button>
                    <p className="top-up-legal">
                        Нажимая кнопку, вы перейдёте на защищённую страницу {methods.find((item) => item.id === selectedMethod)?.provider || "платёжной системы"}.
                    </p>
                </form>
        </Panel>
    );
}
