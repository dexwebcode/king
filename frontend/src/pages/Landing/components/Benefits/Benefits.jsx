import { benefits } from "../../landingData";
import { ImagePlaceholder, SectionTitle } from "../../shared";
import "./Benefits.css";

export default function Benefits() {
    return (
        <section className="container panel-section">
            <SectionTitle title="Почему выбирают KingPromotion" />
            <div className="benefit-grid">
                {benefits.map(([title, text], index) => (
                    <article className={`benefit-card ${index === 4 ? 'featured' : ''}`} key={title}>
                        <div>
                            <h3>{title}</h3>
                            <p>{text}</p>
                        </div>
                        <ImagePlaceholder className="benefit-image" />
                    </article>
                ))}
            </div>
        </section>)
}
