import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AppShell, Panel } from "../../ui/AppShell";
import { supportApi } from "./supportApi";
import { formatDateShort, statusMeta } from "./statusMeta";
import TicketMessages from "./TicketMessages";
import TicketReplyForm from "./TicketReplyForm";
import "./Support.css";

export default function TicketPage() {
  const { publicId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    supportApi
      .getTicket(publicId)
      .then((data) => setTicket(data))
      .catch((requestError) => {
        setError(
          requestError.status === 404
            ? "Обращение не найдено."
            : requestError.message || "Не удалось загрузить обращение."
        );
      });
  }, [publicId]);

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
    <AppShell active="support" title="Обращение">
      <div className="ticket-page">
        {error ? (
          <Panel className="support-message support-message--error" role="alert">
            {error}
            <div>
              <Link className="kp-button kp-button--secondary" to="/support">
                К моим обращениям
              </Link>
            </div>
          </Panel>
        ) : ticket === null ? (
          <Panel className="support-message">Загрузка обращения…</Panel>
        ) : (
          <>
            <TicketHeader ticket={ticket} />
            <Panel className="ticket-thread">
              <TicketMessages messages={ticket.messages} perspective="user" />
            </Panel>
            {ticket.status === "closed" ? (
              <Panel className="ticket-closed">
                <p>Обращение закрыто</p>
                <Link className="kp-button kp-button--secondary" to="/support">
                  Создать новое обращение
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
  const meta = statusMeta(ticket.status);
  return (
    <header className="ticket-header">
      <div className="ticket-header-copy">
        <p className="kp-eyebrow">Обращение</p>
        <h1>Обращение #{ticket.public_id}</h1>
        <p>Создано: {formatDateShort(ticket.created_at)}</p>
      </div>
      <span className={`kp-status kp-status--${meta.tone} ticket-status`}>
        <i />
        {meta.label}
      </span>
    </header>
  );
}
