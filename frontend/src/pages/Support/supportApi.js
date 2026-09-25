const API_URL = import.meta.env.VITE_API_URL || "";

async function request(path, { method = "GET", body } = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.detail || "Ошибка запроса к серверу");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const supportApi = {
  createTicket: (payload) =>
    request("/api/support/tickets", { method: "POST", body: payload }),
  getTickets: () => request("/api/support/tickets"),
  getTicket: (publicId) =>
    request(`/api/support/tickets/${encodeURIComponent(publicId)}`),
  sendMessage: (publicId, message) =>
    request(`/api/support/tickets/${encodeURIComponent(publicId)}/messages`, {
      method: "POST",
      body: { message },
    }),
  closeTicket: (publicId) =>
    request(`/api/support/tickets/${encodeURIComponent(publicId)}/close`, {
      method: "POST",
    }),
  adminListTickets: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });
    const qs = query.toString();
    return request(`/api/admin/support/tickets${qs ? `?${qs}` : ""}`);
  },
  adminGetTicket: (publicId) =>
    request(`/api/admin/support/tickets/${encodeURIComponent(publicId)}`),
  adminSendMessage: (publicId, message) =>
    request(`/api/admin/support/tickets/${encodeURIComponent(publicId)}/messages`, {
      method: "POST",
      body: { message },
    }),
  adminChangeStatus: (publicId, status) =>
    request(`/api/admin/support/tickets/${encodeURIComponent(publicId)}/status`, {
      method: "PATCH",
      body: { status },
    }),
};
