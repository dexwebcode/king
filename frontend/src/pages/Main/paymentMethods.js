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
    {
        id: "crystalpay",
        name: "CrystalPAY",
        description: "Оплата удобным способом на странице CrystalPAY",
        provider: "CrystalPAY",
        badge: "Новый способ",
        endpoint: "/api/payments/crystalpay/create",
        apiValue: "crystalpay",
        enabled: true,
    },
    {
        id: "heleket",
        name: "Heleket",
        description: "Оплата криптовалютой",
        provider: "Heleket",
        badge: "Криптовалюта",
        mark: "₿",
        endpoint: "/api/payments/heleket/create",
        apiValue: "heleket",
        enabled: true,
    },
];

export function availablePaymentMethods() {
    return PAYMENT_METHODS.filter((method) => method.enabled);
}
