import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { updateCachedBalance } from "./dataCache";
import { useLanguage } from "./i18n";
import "./PaymentOverlay.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const PENDING_PAYMENT_KEY = "king_pending_payment";
const STATUS_CHECK_INTERVAL = 2000;
const MAX_STATUS_CHECKS = 90;
const CHECKOUT_WINDOW_NAME = "king-payment-checkout";

/* Статусы, после которых платёж уже не изменится — уведомление убираем. */
const CLOSED_PAYMENT_STATUSES = [
    "expired",
    "wrongamount",
    "failed",
    "unavailable",
    "creation_failed",
    "verification_failed",
];

/* Форматирует секунды в MM:SS для таймера оплаты. */
function formatCountdown(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

function readStoredPayment() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PENDING_PAYMENT_KEY) || "null");
        if (!parsed?.attempt_id) return null;
        return {
            attemptId: String(parsed.attempt_id),
            purpose: parsed.purpose || "order",
        };
    } catch {
        return null;
    }
}

function storedCheckoutUrl() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PENDING_PAYMENT_KEY) || "null");
        return typeof parsed?.checkout_url === "string" ? parsed.checkout_url : "";
    } catch {
        return "";
    }
}

function clearPendingPayment() {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
    localStorage.removeItem("pending_balance_top_up_id");
    localStorage.removeItem("pending_order_id");
}

const PaymentOverlayContext = createContext({ open: () => { }, close: () => { }, notify: () => { } });

export function usePaymentOverlay() {
    return useContext(PaymentOverlayContext);
}

/* Провайдер держит компактное уведомление об активном платеже в углу.
   Отдельного окна и кнопки отмены нет: у провайдеров платёж не отменить,
   поэтому достаточно информировать пользователя и вести его на страницу оплаты. */
export function PaymentOverlayProvider({ children }) {
    /* Уведомление переживает перезагрузку: поднимаем платёж из localStorage. */
    const [session, setSession] = useState(() => readStoredPayment());
    const [notice, setNotice] = useState(null);
    const noticeTimer = useRef(null);

    const open = useCallback((next) => {
        setSession({
            attemptId: String(next?.attemptId || ""),
            purpose: next?.purpose || "order",
        });
    }, []);

    const close = useCallback(() => setSession(null), []);

    const notify = useCallback((message) => {
        setNotice(message);
        if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
    }, []);

    const value = useMemo(() => ({ open, close, notify }), [open, close, notify]);

    return (
        <PaymentOverlayContext.Provider value={value}>
            {children}
            {session && (
                <PaymentWidget
                    key={session.attemptId}
                    attemptId={session.attemptId}
                    purpose={session.purpose}
                    onClose={close}
                    notify={notify}
                />
            )}
            {notice && <div className="payment-toast" role="status">{notice}</div>}
        </PaymentOverlayContext.Provider>
    );
}

/* Уведомление о платеже: живёт в углу, пока платёж не истёк или не оплачен. */
function PaymentWidget({ attemptId, purpose = "order", onClose, notify }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [payment, setPayment] = useState(null);
    const [now, setNow] = useState(() => Date.now());
    const [phase, setPhase] = useState("checking");

    const expiresAtMs = useMemo(() => {
        if (!payment?.expires_at) return null;
        const ts = Date.parse(payment.expires_at);
        return Number.isFinite(ts) ? ts : null;
    }, [payment?.expires_at]);

    const dismiss = useCallback((message) => {
        clearPendingPayment();
        if (message) notify?.(message);
        onClose?.();
    }, [notify, onClose]);

    const checkStatus = useCallback(async () => {
        if (!attemptId) {
            dismiss();
            return true;
        }
        const token = localStorage.getItem("token");
        const response = await fetch(API_URL + "/api/payment-attempts/" + attemptId, {
            headers: { Authorization: "Bearer " + token },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("status unavailable");
        setPayment(data);

        if (data.status === "processed") {
            updateCachedBalance(data.balance);
            const stillDispatching = data.purpose === "order"
                && !["completed", "insufficient_supplier_balance", "supplier_unavailable", "unknown", "rejected", "save_failed"].includes(data.dispatch_status);
            if (stillDispatching) {
                setPhase("dispatching");
                return false;
            }
            dismiss(data.purpose === "balance_topup" ? t("Баланс пополнен") : t("Оплата прошла"));
            return true;
        }
        if (["cancel_requested", "canceled"].includes(data.status)) {
            dismiss();
            return true;
        }
        if (CLOSED_PAYMENT_STATUSES.includes(data.status)) {
            dismiss();
            return true;
        }
        if (data.status === "paid_after_cancel") {
            dismiss(t("Платёж пришёл после закрытия — поддержка проверит"));
            return true;
        }
        setPhase("pending");
        return false;
    }, [attemptId, dismiss, t]);

    useEffect(() => {
        let active = true;
        let timeoutId;
        let checks = 0;
        async function poll() {
            try {
                const finished = await checkStatus();
                if (!active || finished) return;
            } catch {
                if (!active) return;
            }
            checks += 1;
            if (checks >= MAX_STATUS_CHECKS) {
                dismiss();
                return;
            }
            timeoutId = window.setTimeout(poll, STATUS_CHECK_INTERVAL);
        }
        poll();
        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [checkStatus, dismiss]);

    /* Таймер оплаты: обновляем now раз в секунду. */
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const remainingMs = expiresAtMs != null ? expiresAtMs - now : null;
    const remainingSeconds = remainingMs != null ? Math.max(0, Math.ceil(remainingMs / 1000)) : null;
    const lowTime = remainingSeconds != null && remainingSeconds > 0 && remainingSeconds <= 60;
    const expired = expiresAtMs != null && remainingMs <= 0;

    /* Время вышло: платёж гасится сам, уведомление пропадает. */
    useEffect(() => {
        if (!expired) return;
        if (phase !== "checking" && phase !== "pending") return;
        dismiss(t("Время оплаты истекло. Создайте новый платёж, если хотите продолжить."));
    }, [expired, phase, dismiss, t]);

    /* Клик ведёт на страницу оплаты (уже открытую вкладку переиспользуем). */
    function openPayment() {
        const url = payment?.confirmation_url || storedCheckoutUrl();
        if (url) {
            const win = window.open(url, CHECKOUT_WINDOW_NAME);
            if (win) win.opener = null;
            return;
        }
        navigate(purpose === "balance_topup" ? "/main?section=balance" : "/main", {
            state: { section: "orders" },
        });
    }

    const confirming = phase === "dispatching";

    return (
        <div className="payment-widget" role="status">
            <button className="payment-widget__main" type="button" onClick={openPayment}>
                <span className="payment-widget__eyebrow">
                    {confirming ? t("Оплата подтверждена") : t("Активный платёж")}
                </span>
                <span className="payment-widget__title">
                    {confirming ? t("Заказ готовится к запуску") : t("Ожидаем оплату")}
                </span>
                {!confirming && remainingSeconds != null && remainingSeconds > 0 && (
                    <span className={"payment-widget__timer" + (lowTime ? " is-low" : "")}>
                        {lowTime
                            ? t("Осталась минута: {time}", { time: formatCountdown(remainingSeconds) })
                            : t("Оплатите в течение {time}", { time: formatCountdown(remainingSeconds) })}
                    </span>
                )}
                <span className="payment-widget__hint">
                    {confirming
                        ? t("Результат появится в личном кабинете")
                        : t("Нажмите, чтобы вернуться к оплате")}
                </span>
            </button>
        </div>
    );
}
