import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, EmptyState, PageHeader, Panel } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import { supportApi } from "../Support/supportApi";
import { formatDate, STATUS_ORDER, statusMeta } from "../Support/statusMeta";
import TicketMessages from "../Support/TicketMessages";
import TicketReplyForm from "../Support/TicketReplyForm";
import "./AdminSupport.css";

const FILTERS = [
  { value: "", label: "Все" },
  { value: "new", label: "Новые" },
  { value: "in_progress", label: "В работе" },
  { value: "waiting_user", label: "Ожидают ответа" },
  { value: "answered", label: "Есть ответ" },
  { value: "closed", label: "Закрытые" },
];

export default function AdminSupport() {
  const { t } = useLanguage();
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadList = useCallback(async () => {
    const requestId = ++listRequestId.current;
    const data = await supportApi.adminListTickets({
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
    });
    // Применяем результат только последнего запроса: быстрый поиск/фильтр
    // не должен перезаписывать новый список старым ответом.
    if (requestId !== listRequestId.current) return;
    setTickets(Array.isArray(data.items) ? data.items : []);
    setTotal(data.total || 0);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadList()
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 403) setForbidden(true);
        else setError(requestError.message || t("Не удалось загрузить обращения."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadList, t]);

  async function openTicket(publicId) {
    const requestId = ++detailRequestId.current;
    setDetailLoading(true);
    setError("");
    try {
      const data = await supportApi.adminGetTicket(publicId);
      if (requestId !== detailRequestId.current) return;
      setSelected(data);
    } catch (requestError) {
      if (requestId !== detailRequestId.current) return;
      setError(requestError.message || t("Не удалось загрузить обращение."));
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!selected) return;
    await openTicket(selected.public_id);
  }

  function handleMessageSent(result) {
    setSelected((current) => ({
      ...current,
      status: result.ticket.status,
      status_label: result.ticket.status_label,
      updated_at: result.ticket.updated_at,
      messages: [...(current.messages || []), result.message],
    }));
    loadList().catch(() => {});
  }

  async function changeStatus(publicId, status) {
    setError("");
    try {
      const result = await supportApi.adminChangeStatus(publicId, status);
      setSelected((current) => (current ? { ...current, ...result.ticket, messages: current.messages } : current));
      loadList().catch(() => {});
    } catch (requestError) {
      setError(requestError.message || t("Не удалось изменить статус."));
    }
  }

  if (forbidden) {
    return (
      <AppShell title={t("Админ-панель")}>
        <Panel className="admin-denied">
          <p className="kp-eyebrow">{t("403 · доступ запрещён")}</p>
          <h1>{t("Админ-панель недоступна")}</h1>
          <p>{t("У текущего аккаунта нет административных прав.")}</p>
          <Link className="kp-button" to="/main">{t("Вернуться в кабинет")}</Link>
        </Panel>
      </AppShell>
    );
  }

  return (
    <AppShell active="admin" contentClassName="admin-page" title={t("Поддержка")}>
      <PageHeader
        eyebrow={t("Операционный центр")}
        description={t("Все обращения пользователей и переписка с ними.")}
        actions={<Link className="kp-button kp-button--secondary" to="/admin">{t("Контроль заказов")}</Link>}
      />

      {error && <p className="admin-alert" role="alert">{error}</p>}

      <section className="asup-layout">
        <Panel className="asup-list">
          <div className="asup-filters">
            <div className="asup-filter-tabs" role="tablist" aria-label={t("Фильтр по статусу")}>
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={statusFilter === filter.value ? "is-active" : ""}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {t(filter.label)}
                </button>
              ))}
            </div>
            <input
              className="kp-field asup-search"
              type="search"
              placeholder={t("Поиск: номер, тема, пользователь…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <p className="asup-empty">{t("Загрузка обращений…")}</p>
          ) : tickets.length === 0 ? (
            <EmptyState>{t("Обращения не найдены.")}</EmptyState>
          ) : (
            <div className="asup-rows">
              {tickets.map((ticket) => {
                const meta = statusMeta(ticket.status, true);
                return (
                  <button
                    key={ticket.public_id}
                    type="button"
                    className={`asup-row ${selected?.public_id === ticket.public_id ? "is-active" : ""}`}
                    onClick={() => openTicket(ticket.public_id)}
                  >
                    <div className="asup-row-main">
                      <small>#{ticket.public_id} · {ticket.user_login}</small>
                      <strong>{ticket.subject}</strong>
                      <span>{ticket.last_message || ticket.description}</span>
                    </div>
                    <div className="asup-row-side">
                      <span className={`kp-status kp-status--${meta.tone}`}>
                        <i />
                        {t(meta.label)}
                      </span>
                      <time>{formatDate(ticket.updated_at)}</time>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="asup-count">{t("Всего обращений: {total}", { total })}</div>
        </Panel>

        <Panel className="asup-detail">
          {detailLoading ? (
            <p className="asup-empty">{t("Загрузка обращения…")}</p>
          ) : selected === null ? (
            <p className="asup-empty">{t("Выберите обращение из списка.")}</p>
          ) : (
            <>
              <header className="asup-detail-head">
                <div>
                  <p className="kp-eyebrow">#{selected.public_id}</p>
                  <h2>{selected.subject}</h2>
                  <p className="asup-detail-meta">
                    {t("Пользователь: {login} · Создано: {date}", { login: selected.user_login, date: formatDate(selected.created_at) })}
                  </p>
                  {selected.contact ? <p className="asup-detail-meta">{t("Контакт: {contact}", { contact: selected.contact })}</p> : null}
                </div>
                <select
                  className="kp-field asup-status-select"
                  value={selected.status}
                  onChange={(event) => changeStatus(selected.public_id, event.target.value)}
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {t(statusMeta(status, true).label)}
                    </option>
                  ))}
                </select>
              </header>

              <div className="asup-thread">
                <TicketMessages messages={selected.messages} perspective="admin" />
              </div>

              {selected.status === "closed" ? (
                <p className="asup-closed-note">{t("Обращение закрыто")}</p>
              ) : (
                <TicketReplyForm
                  publicId={selected.public_id}
                  onSent={handleMessageSent}
                  sendMessage={(message) => supportApi.adminSendMessage(selected.public_id, message)}
                />
              )}

              <button className="kp-button kp-button--secondary asup-refresh" type="button" onClick={refreshDetail}>
                {t("Обновить")}
              </button>
            </>
          )}
        </Panel>
      </section>
    </AppShell>
  );
}
