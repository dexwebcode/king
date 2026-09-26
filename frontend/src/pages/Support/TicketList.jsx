import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, Panel } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import { supportApi } from "./supportApi";
import { formatDate, statusMeta } from "./statusMeta";

export default function TicketList({ onCreate }) {
  const { t } = useLanguage();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supportApi
      .getTickets()
      .then((data) => {
        if (active) setTickets(Array.isArray(data.items) ? data.items : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || t("Не удалось загрузить обращения. Попробуйте ещё раз."));
      });
    return () => {
      active = false;
    };
  }, [t]);

  if (error) {
    return <Panel className="support-message support-message--error" role="alert">{error}</Panel>;
  }
  if (tickets === null) {
    return <Panel className="support-message">{t("Загрузка обращений…")}</Panel>;
  }
  if (tickets.length === 0) {
    return (
      <EmptyState>
        <p>{t("У вас пока нет обращений в поддержку.")}</p>
        {onCreate && (
          <button className="kp-button kp-button--secondary" type="button" onClick={onCreate}>
            {t("Создать обращение")}
          </button>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="ticket-list">
      {tickets.map((ticket) => (
        <TicketCard key={ticket.public_id} ticket={ticket} />
      ))}
    </div>
  );
}

export function TicketCard({ ticket }) {
  const { t } = useLanguage();
  const meta = statusMeta(ticket.status);
  return (
    <Link className="ticket-card" to={`/support/${ticket.public_id}`}>
      <div className="ticket-card-top">
        <span className="ticket-id">#{ticket.public_id}</span>
        <span className={`kp-status kp-status--${meta.tone}`}>
          <i />
          {t(meta.label)}
        </span>
      </div>
      <strong className="ticket-subject">{ticket.subject}</strong>
      <span className="ticket-updated">{t("Последнее обновление: {date}", { date: formatDate(ticket.updated_at) })}</span>
    </Link>
  );
}
