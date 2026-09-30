/* Единый API-клиент административной панели.
   Все запросы идут на /api/admin/*, защищены backend-проверкой роли;
   frontend здесь не является механизмом безопасности. */

const API_URL = import.meta.env.VITE_API_URL || "";

function qs(params) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            query.set(key, String(value));
        }
    });
    return query.toString();
}

async function adminRequest(path, options = {}) {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(data?.detail || "Ошибка запроса к серверу");
        error.status = response.status;
        throw error;
    }
    return data;
}

export const adminApi = {
    me: () => adminRequest("/api/admin/me"),

    dashboard: () => adminRequest("/api/admin/dashboard"),
    supplierBalance: () => adminRequest("/api/admin/supplier/balance"),

    revenueStats: (params) => adminRequest(`/api/admin/stats/revenue?${qs(params)}`),
    usersStats: (params) => adminRequest(`/api/admin/stats/users?${qs(params)}`),
    trafficStats: (params) => adminRequest(`/api/admin/stats/traffic?${qs(params)}`),
    finance: (params) => adminRequest(`/api/admin/finance?${qs(params)}`),

    orders: (params) => adminRequest(`/api/admin/orders?${qs(params)}`),
    order: (id) => adminRequest(`/api/admin/orders/${id}`),
    orderStatus: (id, status) =>
        adminRequest(`/api/admin/orders/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    attentionOrders: () => adminRequest("/api/admin/orders/attention"),
    retryDispatch: (id) =>
        adminRequest(`/api/admin/orders/${id}/retry-dispatch`, { method: "POST" }),
    resolveDispatch: (id, payload) =>
        adminRequest(`/api/admin/orders/${id}/resolve-dispatch`, {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    users: (params) => adminRequest(`/api/admin/users?${qs(params)}`),
    user: (id) => adminRequest(`/api/admin/users/${id}`),
    banUser: (id, reason) =>
        adminRequest(`/api/admin/users/${id}/ban`, {
            method: "POST",
            body: JSON.stringify({ reason: reason || null }),
        }),
    unbanUser: (id) =>
        adminRequest(`/api/admin/users/${id}/unban`, { method: "POST" }),

    reviews: (params) => adminRequest(`/api/admin/reviews?${qs(params)}`),
    deleteReview: (id) =>
        adminRequest(`/api/admin/reviews/${id}`, { method: "DELETE" }),
    restoreReview: (id) =>
        adminRequest(`/api/admin/reviews/${id}/restore`, { method: "POST" }),

    settings: () => adminRequest("/api/admin/settings"),
    setMarkup: (value) =>
        adminRequest("/api/admin/settings/markup", {
            method: "PUT",
            body: JSON.stringify({ value: Number(value) }),
        }),
    setActiveWindow: (minutes) =>
        adminRequest("/api/admin/settings/active-window", {
            method: "PUT",
            body: JSON.stringify({ minutes: Number(minutes) }),
        }),

    auditLog: (params) => adminRequest(`/api/admin/audit-log?${qs(params)}`),
};

export { adminRequest };
