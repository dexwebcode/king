import { useState } from "react";

import { Panel } from "../../ui/AppShell";
import { supportApi } from "./supportApi";

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const CONTACT_MAX = 255;

export default function CreateTicketForm({ onCreated }) {
  const [step, setStep] = useState("problem");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleContinue(event) {
    event.preventDefault();
    const value = message.trim();
    if (value.length < MESSAGE_MIN) {
      setError(`Опишите проблему подробнее — минимум ${MESSAGE_MIN} символов.`);
      return;
    }
    if (value.length > MESSAGE_MAX) {
      setError(`Сообщение не должно превышать ${MESSAGE_MAX} символов.`);
      return;
    }
    setError("");
    setStep("contact");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedContact = contact.trim();
    if (!trimmedContact) {
      setError("Укажите способ связи.");
      return;
    }
    if (/[<>\n\r\t]/.test(trimmedContact)) {
      setError("Контакт не должен содержать HTML или переносы строк.");
      return;
    }
    if (trimmedContact.length > CONTACT_MAX) {
      setError("Контакт слишком длинный.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const ticket = await supportApi.createTicket({
        message: message.trim(),
        contact: trimmedContact,
      });
      onCreated(ticket);
    } catch (requestError) {
      setError(requestError.message || "Не удалось создать обращение. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  if (step === "contact") {
    return (
      <Panel className="support-form-panel">
        <form className="support-form" onSubmit={handleSubmit}>
          <div className="support-step-head">
            <p className="kp-eyebrow">Шаг 2 из 2</p>
            <h2>Как с вами можно связаться?</h2>
            <p className="kp-page-description">
              Укажите ссылку на Telegram, WhatsApp, Instagram или другую соцсеть.
            </p>
          </div>
          <label className="support-field">
            <span>Контакт для связи</span>
            <input
              className="kp-field"
              type="text"
              value={contact}
              maxLength={CONTACT_MAX}
              placeholder="https://t.me/username"
              autoFocus
              onChange={(event) => setContact(event.target.value)}
            />
          </label>
          {error && <p className="support-form-error" role="alert">{error}</p>}
          <div className="support-form-actions">
            <button
              className="kp-button kp-button--secondary"
              type="button"
              onClick={() => setStep("problem")}
              disabled={loading}
            >
              Назад
            </button>
            <button
              className="kp-button kp-button--form"
              type="submit"
              disabled={loading || !contact.trim()}
            >
              {loading ? "Отправляем…" : "Отправить обращение"}
            </button>
          </div>
        </form>
      </Panel>
    );
  }

  return (
    <Panel className="support-form-panel">
      <form className="support-form" onSubmit={handleContinue}>
        <div className="support-step-head">
          <p className="kp-eyebrow">Шаг 1 из 2</p>
          <h2>Опишите вашу проблему</h2>
          <p className="kp-page-description">
            Опишите проблему, и наша команда поможет вам.
          </p>
        </div>
        <label className="support-field">
          <textarea
            className="kp-field support-textarea"
            rows={6}
            value={message}
            maxLength={MESSAGE_MAX}
            placeholder="Опишите вашу проблему"
            autoFocus
            onChange={(event) => setMessage(event.target.value)}
          />
          <small>{message.trim().length} / {MESSAGE_MAX}</small>
        </label>
        {error && <p className="support-form-error" role="alert">{error}</p>}
        <div className="support-form-actions">
          <button className="kp-button" type="submit">
            Продолжить
          </button>
        </div>
      </form>
    </Panel>
  );
}
