import { stats } from "../../landingData";
import "./css/Stats.css";

export default function Stats() {
    return (
        <section className="stats" aria-label="KingPromotion в цифрах">
            {stats.map(([value, label]) => (
                <article className="stat-card" key={label}>
                    <span className="stat-icon" aria-hidden="true"></span>
                    <div><strong>{value}</strong><small>{label}</small></div>
                </article>
            ))}
        </section>
    )
}
