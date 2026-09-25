"""Статусы обращений поддержки и типы отправителей — единый источник истины."""

from enum import Enum


class SupportTicketStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    ANSWERED = "answered"
    WAITING_USER = "waiting_user"
    CLOSED = "closed"


class SupportSenderType(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SYSTEM = "system"


# Русские названия статусов для пользователя (пункт 4 ТЗ).
USER_STATUS_LABELS = {
    SupportTicketStatus.NEW: "Новая",
    SupportTicketStatus.IN_PROGRESS: "В работе",
    SupportTicketStatus.ANSWERED: "Есть ответ",
    SupportTicketStatus.WAITING_USER: "Ожидает вашего ответа",
    SupportTicketStatus.CLOSED: "Закрыта",
}

# Русские названия статусов для администратора.
ADMIN_STATUS_LABELS = {
    SupportTicketStatus.NEW: "Новая",
    SupportTicketStatus.IN_PROGRESS: "В работе",
    SupportTicketStatus.ANSWERED: "Есть ответ",
    SupportTicketStatus.WAITING_USER: "Ожидает ответа",
    SupportTicketStatus.CLOSED: "Закрыта",
}

VALID_STATUS_VALUES = frozenset(status.value for status in SupportTicketStatus)


def status_label(status: str, *, for_admin: bool = False) -> str:
    """Возвращает русское название статуса; неизвестное — как есть."""
    labels = ADMIN_STATUS_LABELS if for_admin else USER_STATUS_LABELS
    try:
        return labels[SupportTicketStatus(status)]
    except (KeyError, ValueError):
        return status
