import orderIcon from "../../../../assets/icons/1.webp";
import checkIcon from "../../../../assets/icons/2.webp";
import historyIcon from "../../../../assets/icons/3.webp";
import securityIcon from "../../../../assets/icons/4.webp";
import helpIcon from "../../../../assets/icons/5.webp";
import startIcon from "../../../../assets/icons/6.webp";

import { benefits } from "../../landingData";
import { SectionTitle } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import "./css/Benefits.css";

const benefitIcons = [
    orderIcon,
    checkIcon,
    historyIcon,
    securityIcon,
    helpIcon,
    startIcon,
];

export default function Benefits() {
    const { t } = useLanguage();
    return (
        <section className="container panel-section benefits-section">
            <SectionTitle title={t("Почему выбирают KingPromotion")} />

            <div className="benefit-grid">
                {benefits.map(([title, summary, description], index) => (
                    <article className="benefit-card" key={title} tabIndex={0}>
                        <div className="benefit-card-panel">
                            <div className="benefit-card-copy">
                                <h3>{t(title)}</h3>
                                <p>{t(description)}</p>
                            </div>
                            <div className="benefit-card-logo" aria-hidden="true">
                                <img className="benefit-card-icon" src={benefitIcons[index]} alt="" />
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
