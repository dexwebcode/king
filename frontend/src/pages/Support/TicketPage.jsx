import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell, Panel } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import { supportApi } from "./supportApi";
import { formatDateShort, statusMeta } from "./statusMeta";
import TicketMessages from "./TicketMessages";
import TicketReplyForm from "./TicketReplyForm";
import "./Support.css";

export default function TicketPage() {
  const { t } = useLanguage();
  const { publicId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(() => {
    const currentId = ++requestId.current;
    setError("");
    supportApi
      .getTicket(publicId)
      .then((data) => {
        // Только ответ последнего запроса: смена publicId не должна
        // перезаписывать новое обращение старым ответом.
        if (currentId === requestId.current) setTicket(data);
      })
      .catch((requestError) => {
        if (currentId !== requestId.current) return;
        setError(
          requestError.status === 404
            ? t("Обращение не найдено.")
            : requestError.message || t("Не удалось загрузить обращение.")
        );
      });
  }, [publicId, t]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSent(result) {
    setTicket((current) => ({
      ...current,
      status: result.ticket.status,
      status_label: result.ticket.status_label,
      updated_at: result.ticket.updated_at,
      messages: [...(current.messages || []), result.message],
    }));
  }

  return (
    <AppShell active="support" title={t("Обращение")}>
      <div className="ticket-page">
        {error ? (
          <Panel className="support-message support-message--error" role="alert">
            {error}
            <div>
              <Link className="kp-button kp-button--secondary" to="/support">
                {t("К моим обращениям")}
              </Link>
            </div>
          </Panel>
        ) : ticket === null ? (
          <Panel className="support-message">{t("Загрузка обращения…")}</Panel>
        ) : (
          <>
            <TicketHeader ticket={ticket} />
            <Panel className="ticket-thread">
              <TicketMessages messages={ticket.messages} perspective="user" />
            </Panel>
            {ticket.status === "closed" ? (
              <Panel className="ticket-closed">
                <p>{t("Обращение закрыто")}</p>
                <Link className="kp-button kp-button--secondary" to="/support">
                  {t("Создать новое обращение")}
                </Link>
              </Panel>
            ) : (
              <TicketReplyForm publicId={ticket.public_id} onSent={handleSent} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export function TicketHeader({ ticket }) {
  const { t } = useLanguage();
  const meta = statusMeta(ticket.status);
  return (
    <header className="ticket-header">
      <div className="ticket-header-copy">
        <p className="kp-eyebrow">{t("Обращение")}</p>
        <h1>{t("Обращение #{publicId}", { publicId: ticket.public_id })}</h1>
        <p>{t("Создано: {date}", { date: formatDateShort(ticket.created_at) })}</p>
      </div>
      <span className={`kp-status kp-status--${meta.tone} ticket-status`}>
        <i />
        {t(meta.label)}
      </span>
    </header>
  );
}
