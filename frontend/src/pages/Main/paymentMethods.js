import sbpIcon from "../../assets/icons/sbp.svg";
import crystalpayIcon from "../../assets/icons/cristalpay.svg";
import heleketIcon from "../../assets/icons/helecat.svg";

export const PAYMENT_METHODS = [
    {
        id: "sbp",
        name: "СБП",
        description: "Оплата по QR-коду в приложении вашего банка",
        provider: "ЮKassa",
        badge: "Без комиссии",
        icon: sbpIcon,
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
        icon: crystalpayIcon,
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
        icon: heleketIcon,
        endpoint: "/api/payments/heleket/create",
        apiValue: "heleket",
        enabled: true,
    },
];

export function availablePaymentMethods() {
    return PAYMENT_METHODS.filter((method) => method.enabled);
}
