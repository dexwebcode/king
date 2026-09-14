import orderIcon from "../../../../assets/icons/order.png";
import checkIcon from "../../../../assets/icons/check.png";
import historyIcon from "../../../../assets/icons/history.png";
import securityIcon from "../../../../assets/icons/security.png";
import helpIcon from "../../../../assets/icons/help.png";
import startIcon from "../../../../assets/icons/start.png";

import { benefits } from "../../landingData";
import { SectionTitle } from "../../shared";
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
    return (
        <section className="container panel-section benefits-section">
            <SectionTitle title="Почему выбирают KingPromotion" />

            <div className="benefit-grid">
                {benefits.map(([title, summary, description], index) => (
                    <article className="benefit-card" key={title} tabIndex={0}>
                        <div className="benefit-card-panel">
                            <div className="benefit-card-copy">
                                <h3>{title}</h3>
                                <strong>{summary}</strong>
                                <p>{description}</p>
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
