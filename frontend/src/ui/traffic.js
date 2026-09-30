/* Минимальная внутренняя аналитика посещений.

   Отправляет ОДНО событие на открытие страницы (роут): без трекинга мыши
   и без лишних запросов. visitor_id — случайный анонимный ID в localStorage;
   сервер хранит только его HMAC. Если пользователь авторизован, к событию
   прикрепляется JWT — сервер извлекает только user_id для статистики
   авторизованных посетителей. */

const API_URL = import.meta.env.VITE_API_URL || "";
const STORAGE_KEY = "kp_visitor_id";
let lastPath = null;

function getVisitorId() {
    let id = null;
    try {
        id = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        id = null;
    }
    if (!id) {
        id = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch (error) {
            /* приватный режим — не критично */
        }
    }
    return id;
}

export function trackPageView(path) {
    if (!path || path === lastPath) return;
    lastPath = path;

    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch(`${API_URL}/api/analytics/track`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            visitor_id: getVisitorId(),
            event_type: "pageview",
            path,
        }),
        keepalive: true,
    }).catch(() => {});
}
