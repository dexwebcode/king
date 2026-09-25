import { useState } from "react";
import { Link } from "react-router-dom";

import { AppShell, Panel } from "../../ui/AppShell";
import CreateTicketForm from "./CreateTicketForm";
import TicketList from "./TicketList";
import "./Support.css";

export default function SupportPage() {
  const [tab, setTab] = useState("create");
  const [created, setCreated] = useState(null);
  const [listKey, setListKey] = useState(0);

  function goToList() {
    setCreated(null);
    setTab("list");
    setListKey((key) => key + 1);
  }

  return (
    <AppShell active="support" title="Поддержка">
      <div className="support-page">
        <header className="support-hero">
          <p className="kp-page-description">
            Опишите проблему, и наша команда поможет вам.
          </p>
        </header>

        {created ? (
          <Panel className="support-success">
            <div className="support-success-icon" aria-hidden="true">✓</div>
            <h2>Обращение #{created.public_id} создано</h2>
            <p>Мы получили ваше обращение и скоро свяжемся с вами.</p>
            <div className="support-success-actions">
              <Link className="kp-button" to={`/support/${created.public_id}`}>
                Открыть обращение
              </Link>
              <button className="kp-button kp-button--secondary" type="button" onClick={goToList}>
                К моим обращениям
              </button>
            </div>
          </Panel>
        ) : (
          <>
            <div className="support-tabs" role="tablist" aria-label="Разделы поддержки">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "create"}
                className={tab === "create" ? "is-active" : ""}
                onClick={() => setTab("create")}
              >
                Создать обращение
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "list"}
                className={tab === "list" ? "is-active" : ""}
                onClick={() => setTab("list")}
              >
                Мои обращения
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
