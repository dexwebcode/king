import { useEffect, useMemo } from "react";

import Main from "../Main/Main";
import { usePaymentOverlay } from "../../ui/PaymentOverlay";

const PENDING_PAYMENT_KEY = "king_pending_payment";

function readIntent() {
    try {
        const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/* Прямой переход по ссылке оплаты: показываем кабинет, а поверх него —
   то же окно оплаты, что и после кнопки «Оплатить». */
export default function Payment() {
    const { open } = usePaymentOverlay();
    const intent = useMemo(readIntent, []);
    const queryAttempt = new URLSearchParams(window.location.search).get("attempt");
    const attemptId = queryAttempt || intent?.attempt_id || "";
    const purpose = intent?.purpose || "order";

    useEffect(() => {
        open({ attemptId, purpose });
    }, [attemptId, purpose, open]);

    return <Main />;
}
