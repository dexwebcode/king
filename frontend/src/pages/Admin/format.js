/* Общие утилиты форматирования админ-панели. */

export function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return `${number.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ₽`;
}

export function formatNumber(value) {
    if (value === null || value === undefined) return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return number.toLocaleString("ru-RU");
}

export function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatDateShort(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/* Реальные внутренние статусы заказов KingPromotion (orders.status). */
export const ORDER_STATUSES = [
    "Ожидает оплаты",
    "Ожидает отправки",
    "Отправляется",
    "Ожидает пополнения поставщика",
    "Поставщик недоступен",
    "Выполняется",
    "Частично",
    "Готово",
    "Завершен",
    "Оплата отменена",
    "Отменен",
    "Отменен поставщиком",
    "Отмена запрошена",
    "Требует проверки",
    "Отклонен поставщиком",
    "Цена изменилась",
];

export function orderStatusTone(status) {
    const value = String(status || "").toLowerCase();
    if (/заверш|выполнен|готово/.test(value)) return "success";
    if (/оплач|ожида|отправ|выполня|progress|пополнени/.test(value)) return "progress";
    if (/провер|unknown|отклон|отмен|недоступ|cancel|ошиб|цена/.test(value)) return "warning";
    return "neutral";
}
