import { stats } from "../../landingData";
import "./css/Stats.css";

export default function Stats() {
    return (
        <section className="stats container">
            {stats.map(([value, label]) => (
                <article className="stat-card" key={label}>
                    <span className="stat-icon">◈</span>
                    <div><strong>{value}</strong><small>{label}</small></div>
                </article>
            ))}
        </section>
    )
}
