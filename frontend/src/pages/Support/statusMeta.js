export const STATUS_META = {
  new: { label: "Новая", adminLabel: "Новая", tone: "progress" },
  in_progress: { label: "В работе", adminLabel: "В работе", tone: "progress" },
  answered: { label: "Есть ответ", adminLabel: "Есть ответ", tone: "success" },
  waiting_user: { label: "Ожидает вашего ответа", adminLabel: "Ожидает ответа", tone: "warning" },
  closed: { label: "Закрыта", adminLabel: "Закрыта", tone: "neutral" },
};

export const STATUS_ORDER = ["new", "in_progress", "answered", "waiting_user", "closed"];

export function statusMeta(status, admin = false) {
  const meta = STATUS_META[status] || { label: status, adminLabel: status, tone: "neutral" };
  return { ...meta, label: admin ? meta.adminLabel : meta.label };
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateShort(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
