import { useState } from "react";

import { benefits } from "../../landingData";
import { SectionTitle } from "../../shared";
import "./css/Benefits.css";

export default function Benefits() {
    const [activeBenefit, setActiveBenefit] = useState(0);
    const [slideDirection, setSlideDirection] = useState("next");
    const [title, summary, description] = benefits[activeBenefit];
    const previousBenefit = benefits[(activeBenefit - 1 + benefits.length) % benefits.length];
    const nextBenefit = benefits[(activeBenefit + 1) % benefits.length];

    function showBenefit(index, direction) {
        setSlideDirection(direction);
        setActiveBenefit((index + benefits.length) % benefits.length);
    }

    function showPrevious() {
        showBenefit(activeBenefit - 1, "previous");
    }

    function showNext() {
        showBenefit(activeBenefit + 1, "next");
    }

    return (
        <section className="container panel-section benefits-section">
            <SectionTitle title="Почему выбирают KingPromotion" />

            <div className="benefit-slider">
                <button
                    className="benefit-slider-arrow benefit-slider-arrow--previous"
                    type="button"
                    aria-label="Предыдущее преимущество"
                    onClick={showPrevious}
                >
                    ←
                </button>

                <div className="benefit-slider-stage">
                    <button
                        className="benefit-slide-preview benefit-slide-preview--left"
                        type="button"
                        key={`previous-${activeBenefit}`}
                        aria-label={`Показать: ${previousBenefit[0]}`}
                        onClick={showPrevious}
                    >
                        <span>{previousBenefit[0]}</span>
                        <small>{previousBenefit[1]}</small>
                    </button>

                    <article
                        className={`benefit-slide benefit-slide--${slideDirection}`}
                        key={`${activeBenefit}-${slideDirection}`}
                        aria-live="polite"
                    >
                        <h3>{title}</h3>
                        <strong>{summary}</strong>
                        <p>{description}</p>
                    </article>

                    <button
                        className="benefit-slide-preview benefit-slide-preview--right"
                        type="button"
                        key={`next-${activeBenefit}`}
                        aria-label={`Показать: ${nextBenefit[0]}`}
                        onClick={showNext}
                    >
                        <span>{nextBenefit[0]}</span>
                        <small>{nextBenefit[1]}</small>
                    </button>
                </div>

                <button
                    className="benefit-slider-arrow benefit-slider-arrow--next"
                    type="button"
                    aria-label="Следующее преимущество"
                    onClick={showNext}
                >
                    →
                </button>
            </div>

            <div className="benefit-slider-dots" aria-label="Выбор преимущества">
                {benefits.map(([benefitTitle], index) => (
                    <button
                        className={index === activeBenefit ? "active" : ""}
                        type="button"
                        key={benefitTitle}
                        aria-label={benefitTitle}
                        aria-current={index === activeBenefit ? "true" : undefined}
                        onClick={() => showBenefit(index, index < activeBenefit ? "previous" : "next")}
                    />
                ))}
            </div>
        </section>
    );
}
