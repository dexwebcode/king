import { useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, Panel } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import CreateTicketForm from "./CreateTicketForm";
import TicketList from "./TicketList";
import "./Support.css";

export default function SupportPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState("create");
  const [created, setCreated] = useState(null);
  const [listKey, setListKey] = useState(0);

  function goToList() {
    setCreated(null);
    setTab("list");
    setListKey((key) => key + 1);
  }

  return (
    <AppShell active="support" title={t("Поддержка")}>
      <div className="support-page">
        <header className="support-hero">
          <p className="kp-page-description">
            {t("Опишите проблему, и наша команда поможет вам.")}
          </p>
        </header>

        {created ? (
          <Panel className="support-success">
            <div className="support-success-icon" aria-hidden="true">✓</div>
            <h2>{t("Обращение #{publicId} создано", { publicId: created.public_id })}</h2>
            <p>{t("Мы получили ваше обращение и скоро свяжемся с вами.")}</p>
            <div className="support-success-actions">
              <Link className="kp-button" to={`/support/${created.public_id}`}>
                {t("Открыть обращение")}
              </Link>
              <button className="kp-button kp-button--secondary" type="button" onClick={goToList}>
                {t("К моим обращениям")}
              </button>
            </div>
          </Panel>
        ) : (
          <>
            <div className="support-tabs" role="tablist" aria-label={t("Разделы поддержки")}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "create"}
                className={tab === "create" ? "is-active" : ""}
                onClick={() => setTab("create")}
              >
                {t("Создать обращение")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "list"}
                className={tab === "list" ? "is-active" : ""}
                onClick={() => setTab("list")}
              >
                {t("Мои обращения")}
              </button>
            </div>

            {tab === "create" ? (
              <CreateTicketForm onCreated={setCreated} />
            ) : (
              <TicketList key={listKey} onCreate={() => setTab("create")} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
