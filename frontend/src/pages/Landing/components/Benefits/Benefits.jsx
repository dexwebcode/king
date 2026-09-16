import orderIcon from "../../../../assets/icons/1.png";
import checkIcon from "../../../../assets/icons/2.png";
import historyIcon from "../../../../assets/icons/3.png";
import securityIcon from "../../../../assets/icons/4.png";
import helpIcon from "../../../../assets/icons/5.png";
import startIcon from "../../../../assets/icons/6.png";

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
