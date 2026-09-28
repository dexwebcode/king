import { useState } from "react";

import { FAQ_ITEMS } from "./faqData";
import { SectionTitle } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import "./css/FaqSection.css";

export default function FaqSection() {
    const { t } = useLanguage();
    const [openIndex, setOpenIndex] = useState(0);

    return (
        <section className="container panel-section faq-section" id="faq">
            <SectionTitle
                title={t("Часто задаваемые вопросы")}
                subtitle={t("Ответы на популярные вопросы о старте, оплате и площадках")}
            />

            <div className="faq-section-list">
                {FAQ_ITEMS.map(([question, answer], index) => {
                    const isOpen = index === openIndex;
                    const panelId = `landing-faq-answer-${index}`;
                    return (
                        <article className={`faq-section-item${isOpen ? " is-open" : ""}`} key={question}>
                            <button
                                type="button"
                                className="faq-section-trigger"
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                            >
                                <span className="faq-section-question">{t(question)}</span>
                                <span className="faq-section-mark" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                            </button>
                            <div className="faq-section-answer" id={panelId} role="region" aria-label={t(question)}>
                                <div className="faq-section-answer-inner">
                                    <p>{t(answer)}</p>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
