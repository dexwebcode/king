import { useState } from "react";

import { reliability } from "../../landingData";
import { SectionTitle } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import "./css/Reliability.css";

// Интервал между раскрытием соседних панелей, мс
const OPEN_STEP_MS = 130;

/**
 * Порядок раскрытия: первой идёт панель под курсором,
 * дальше — остальные по мере удаления от неё (при равном
 * расстоянии — слева направо). Каждой панели возвращаем
 * свою задержку, поэтому все 4 выезжают не одновременно.
 */
function getOpenDelay(index, activeIndex) {
    if (activeIndex === null) {
        return 0;
    }

    const rank = reliability
        .map((_, cardIndex) => cardIndex)
        .sort((a, b) => {
            const distanceDiff = Math.abs(a - activeIndex) - Math.abs(b - activeIndex);

            return distanceDiff !== 0 ? distanceDiff : a - b;
        })
        .indexOf(index);

    return rank * OPEN_STEP_MS;
}

export default function Reliability() {
    const { t } = useLanguage();
    const [pinnedIndex, setPinnedIndex] = useState(null);
    const [hoveredIndex, setHoveredIndex] = useState(null);

    // Наведение важнее закрепления кликом: ушли курсором — вернулись к закреплённой панели
    const activeIndex = hoveredIndex !== null ? hoveredIndex : pinnedIndex;
    const isGroupOpen = activeIndex !== null;

    return (
        <section className="container panel-section reliability-section" id="reliability">
            <SectionTitle title={t("Надёжность и безопасность")} subtitle={t("Мы гарантируем безопасность ваших данных и качество услуг")} />

            <div className="reliability-grid" onMouseLeave={() => setHoveredIndex(null)}>
                {reliability.map(([title, text, details, badge], index) => {
                    const isActive = index === activeIndex;
                    const panelId = `reliability-drawer-${index}`;

                    return (
                        <article
                            className={`reliability-card${isGroupOpen ? " is-open" : ""}${isActive ? " is-active" : ""}`}
                            key={title}
                            style={{ "--reliability-open-delay": `${getOpenDelay(index, activeIndex)}ms` }}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onFocus={() => setHoveredIndex(index)}
                            onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) {
                                    setHoveredIndex((current) => (current === index ? null : current));
                                }
                            }}
                        >
                            <button
                                type="button"
                                className="reliability-trigger"
                                aria-expanded={isGroupOpen}
                                aria-controls={panelId}
                                onClick={() => setPinnedIndex(pinnedIndex === index ? null : index)}
                            >
                                <span className="reliability-trigger-copy">
                                    <span className="reliability-trigger-title">{t(title)}</span>
                                    <span className="reliability-trigger-text">{t(text)}</span>
                                </span>
                            </button>

                            <div className="reliability-drawer" id={panelId} role="region" aria-label={t(title)}>
                                <div className="reliability-drawer-inner">
                                    <p>{t(details)}</p>
                                    <span className="reliability-drawer-badge">{t(badge)}</span>
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
