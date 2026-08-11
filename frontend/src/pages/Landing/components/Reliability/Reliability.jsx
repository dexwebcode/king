import { reliability } from "../../landingData";
import { SectionTitle } from "../../shared";
import "./Reliability.css";

export default function Reliability() {
    return (
        <section className="container panel-section">
            <SectionTitle title="Надёжность и безопасность" subtitle="Мы гарантируем безопасность ваших данных и качество услуг" />
            <div className="reliability-grid">
                {reliability.map(([title, text]) => (
                    <article className="reliability-card" key={title}>
                        <span>◈</span>
                        <div><h3>{title}</h3><p>{text}</p></div>
                    </article>
                ))}
            </div>
        </section>
    )
}
