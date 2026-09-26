import { stats } from "../../landingData";
import { useLanguage } from "../../../../ui/i18n";
import "./css/Stats.css";

export default function Stats() {
    const { t } = useLanguage();
    return (
        <section className="stats" aria-label={t("KingPromotion в цифрах")}>
            {stats.map(([value, label]) => (
                <article className="stat-card" key={label}>
                    <span className="stat-icon" aria-hidden="true"></span>
                    <div><strong>{t(value)}</strong><small>{t(label)}</small></div>
                </article>
            ))}
        </section>
    )
}
