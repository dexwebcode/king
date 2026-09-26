import { useEffect, useMemo, useRef, useState } from "react";

import { formatMoney } from "../../ui/catalogMeta";
import { useLanguage } from "../../ui/i18n";
import { formatUsd, useUsdRate } from "../../ui/usdRate";
import PaymentMethodCard from "../../ui/PaymentMethodCard";
import { usePaymentOverlay } from "../../ui/PaymentOverlay";
import { rememberCheckoutWindow } from "../../ui/checkoutWindow";
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

/* Баланс рядом с названием раздела «Баланс» — только цифра, без плашки. */
export function BalanceHero({ balance = 0 }) {
    const { lang, t } = useLanguage();
    const usdRate = useUsdRate();

    return (
        <section className="balance-hero" aria-label={t("Текущий баланс")}>
            <p className="balance-hero-value">
                {lang === "en" && usdRate != null
                    ? formatUsd(balance, usdRate)
                    : <>{formatMoney(balance)}<span>₽</span></>}
            </p>
        </section>
    );
}

export default function BalanceSection({
    balance = 0,
    returnedFromPayment = false,
    onBalanceChange,
    onPaymentSettled,
}) {
    const { t } = useLanguage();
    const { open: openPaymentOverlay } = usePaymentOverlay();
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
                setRequestError(t("Не удалось найти созданное пополнение. Баланс можно проверить, обновив страницу."));
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
                if (!response.ok) throw new Error(getErrorMessage(data, t("Не удалось проверить пополнение")));
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
                    setRequestError(error.message || t("Не удалось проверить пополнение"));
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
            setRequestError(t("Выберите доступный способ оплаты"));
            return;
        }

        const checkoutWindow = window.open("about:blank", "king-payment-checkout");
        if (checkoutWindow) checkoutWindow.opener = null;
        rememberCheckoutWindow(checkoutWindow);
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
            if (!response.ok) throw new Error(getErrorMessage(data, t("Не удалось создать платёж")));
            const topUpId = data?.top_up_id;
            const attemptId = data?.attempt_id;
            const checkoutUrl = data?.confirmation_url;
            if (!topUpId || !attemptId || !checkoutUrl) {
                throw new Error(t("Платёж создан без ссылки для перехода в банк"));
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
            openPaymentOverlay({ attemptId, purpose: "balance_topup" });
        } catch (error) {
            checkoutWindow?.close();
            setRequestError(error.message || t("Не удалось создать платёж. Попробуйте ещё раз."));
            setIsSubmitting(false);
        }
    }

    const currentMethod = methods.find((item) => item.id === selectedMethod);
    const amountValue = parseAmount(amount);

    return (
        <div className="balance-page">
            <header className="balance-intro">
                <h2 className="balance-intro-title">{t("Пополните удобным для вас способом ваш баланс")}</h2>
                <p className="balance-intro-note">{t("Ваш актуальный баланс отобразится в меню")}</p>
            </header>

            <form className="balance-form" onSubmit={handleSubmit} noValidate>
                <section className="balance-panel">
                    <div className="balance-panel-grid">
                        {/* Способ оплаты — слева */}
                        <div className="balance-panel-col balance-panel-col--methods">
                            <div className="payment-method-list" role="radiogroup" aria-label={t("Способ оплаты")}>
                                {methods.map((item) => (
                                    <PaymentMethodCard
                                        key={item.id}
                                        method={item}
                                        selected={selectedMethod === item.id}
                                        onSelect={setSelectedMethod}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Сумма и кнопка оплаты — справа */}
                        <div className="balance-panel-col balance-panel-col--amount">
                            <div className="amount-field-group">
                                <label htmlFor="top-up-amount">{t("Введите сумму")}</label>
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
                                    <small className="top-up-error" id="top-up-amount-error">{t(fieldError)}</small>
                                ) : (
                                    <small id="top-up-amount-hint">{t("От 10 до 100 000 ₽")}</small>
                                )}
                                <div className="quick-amounts" aria-label={t("Быстрый выбор суммы")}>
                                    {QUICK_AMOUNTS.map((quickAmount) => (
                                        <button
                                            className={amountValue === quickAmount ? "is-active" : ""}
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

                            {/* Кнопка оплаты — по центру оставшегося места */}
                            <div className="balance-checkout">
                                <button className="kp-button balance-submit" type="submit" disabled={isSubmitting || methods.length === 0 || !amountValue}>
                                    {isSubmitting ? t("Создаём платёж…") : t("Перейти к оплате")}
                                </button>
                            </div>
                        </div>
                    </div>

                    {requestError && <p className="top-up-request-error" role="alert">{t(requestError)}</p>}

                    <p className="balance-legal">
                        {t("Нажимая кнопку, вы перейдёте на защищённую страницу")} {t(currentMethod?.provider || "платёжной системы")}.
                    </p>
                </section>
            </form>

            {/* Преимущества */}
            <section className="balance-benefits" aria-label={t("Как проходит пополнение")}>
                <article className="balance-benefit">
                    <span className="balance-benefit-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
                    </span>
                    <div>
                        <h3>{t("Зачисление сразу")}</h3>
                        <p>{t("Баланс обновляется автоматически после подтверждения платежа.")}</p>
                    </div>
                </article>
                <article className="balance-benefit">
                    <span className="balance-benefit-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10.5" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                    </span>
                    <div>
                        <h3>{t("Безопасная оплата")}</h3>
                        <p>{t("Платёж проходит на стороне банка-провайдера, данные карты мы не храним.")}</p>
                    </div>
                </article>
                <article className="balance-benefit">
                    <span className="balance-benefit-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4V5Z" /></svg>
                    </span>
                    <div>
                        <h3>{t("Поддержка")}</h3>
                        <p>{t("Если платёж задерживается — напишите нам, разберёмся вместе.")}</p>
                    </div>
                </article>
            </section>
        </div>
    );
}
