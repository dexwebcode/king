import { formatTime } from "./statusMeta";

function labelFor(senderType, perspective) {
  if (senderType === "system") return "Система";
  if (senderType === "user") return perspective === "admin" ? "Пользователь" : "Вы";
  if (senderType === "admin") return perspective === "admin" ? "Вы" : "Поддержка";
  return "Поддержка";
}

export default function TicketMessages({ messages, perspective = "user" }) {
  if (!messages || messages.length === 0) {
    return <p className="support-muted">Сообщений пока нет.</p>;
  }
  return (
    <div className="ticket-messages">
      {messages.map((message) => (
        <TicketMessage key={message.id} message={message} perspective={perspective} />
      ))}
    </div>
  );
}

export function TicketMessage({ message, perspective = "user" }) {
  const mine = message.sender_type === (perspective === "admin" ? "admin" : "user");
  const system = message.sender_type === "system";
  return (
    <article
      className={[
        "ticket-message",
        mine ? "ticket-message--mine" : "",
        system ? "ticket-message--system" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="ticket-message-head">
        <strong>{labelFor(message.sender_type, perspective)}</strong>
        <time>{formatTime(message.created_at)}</time>
      </header>
      <p className="ticket-message-text">{message.message}</p>
    </article>
  );
}
