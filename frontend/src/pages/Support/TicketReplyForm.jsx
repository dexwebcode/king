import { useState } from "react";

import { useLanguage } from "../../ui/i18n";
import { supportApi } from "./supportApi";

const MESSAGE_MAX = 5000;

export default function TicketReplyForm({ publicId, onSent, sendMessage, disabled = false }) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value) {
      setError(t("Сообщение не может быть пустым."));
      return;
    }
    if (value.length > MESSAGE_MAX) {
      setError(t("Сообщение не должно превышать {max} символов.", { max: MESSAGE_MAX }));
      return;
    }
    setError("");
    setSending(true);
    try {
      const result = sendMessage
        ? await sendMessage(value)
        : await supportApi.sendMessage(publicId, value);
      setText("");
      if (onSent) onSent(result);
    } catch (requestError) {
      setError(requestError.message || t("Не удалось отправить сообщение."));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="ticket-reply-form" onSubmit={handleSubmit}>
      <textarea
        className="kp-field ticket-reply-textarea"
        rows={3}
        value={text}
        maxLength={MESSAGE_MAX}
        placeholder={t("Напишите сообщение...")}
        disabled={disabled || sending}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <p className="support-form-error" role="alert">{error}</p>}
      <button
        className="kp-button kp-button--form"
        type="submit"
        disabled={disabled || sending || !text.trim()}
      >
        {sending ? t("Отправляем…") : t("Отправить")}
      </button>
    </form>
  );
}
