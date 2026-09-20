export const PAYMENT_METHODS = [
    {
        id: "sbp",
        name: "СБП",
        description: "Оплата по QR-коду в приложении вашего банка",
        provider: "ЮKassa",
        badge: "Без комиссии",
        endpoint: "/api/balance/top-ups",
        apiValue: "sbp",
        enabled: true,
    },
];

export function availablePaymentMethods() {
    return PAYMENT_METHODS.filter((method) => method.enabled);
}
