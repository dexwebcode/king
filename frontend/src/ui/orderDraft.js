export const ORDER_DRAFT_KEY = "king_order_draft";
export const ORDER_AUTH_PENDING_KEY = "king_order_auth_pending";

function isOrderDraft(value) {
    return Boolean(
        value
        && value.checkout_context === "order-card"
        && value.service_id
        && value.platform
        && value.service_type
        && Number.isFinite(Number(value.quantity))
        && value.recipient_link
    );
}

export function savePendingCheckoutDraft(draft) {
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify({
        ...draft,
        checkout_context: "order-card",
    }));
    sessionStorage.setItem(ORDER_AUTH_PENDING_KEY, "1");
}

export function readPendingCheckoutDraft() {
    if (sessionStorage.getItem(ORDER_AUTH_PENDING_KEY) !== "1") return null;

    try {
        const rawDraft = localStorage.getItem(ORDER_DRAFT_KEY);
        const draft = rawDraft ? JSON.parse(rawDraft) : null;
        if (!isOrderDraft(draft)) throw new Error("Invalid checkout draft");
        return draft;
    } catch {
        clearPendingCheckoutDraft();
        return null;
    }
}

export function hasPendingCheckoutDraft() {
    return Boolean(readPendingCheckoutDraft());
}

export function clearPendingCheckoutDraft() {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    sessionStorage.removeItem(ORDER_AUTH_PENDING_KEY);
}
