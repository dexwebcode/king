import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { SectionTitle } from "../../shared";
import { useLanguage } from "../../../../ui/i18n";
import { platformMeta, platformOrder } from "../../../../ui/catalogMeta";
import { getPrices } from "../../../../ui/dataCache";
import "./css/PopularServices.css";

const popularServices = platformOrder
    .map((id) => ({ id, ...platformMeta[id] }))
    .filter((service) => service.icon || service.id === "shazam");

export default function PopularServices() {
    const { t } = useLanguage();
    const [serviceCounts, setServiceCounts] = useState({});

    useEffect(() => {
        let active = true;

        async function loadServiceCounts() {
            try {
                const items = await getPrices();
                const counts = items.reduce((result, item) => {
                    const platform = String(item.platform || item.soc || "").toLowerCase();
                    if (platform) result[platform] = (result[platform] || 0) + 1;
                    return result;
                }, {});

                if (active) setServiceCounts(counts);
            } catch (error) {
                if (active) setServiceCounts({});
            }
        }

        loadServiceCounts();
        return () => { active = false; };
    }, []);

    return (
        <section className="container panel-section popular-services" id="prices">
            <SectionTitle
                title={t("Популярные сервисы")}
                subtitle={t("Выберите площадку и перейдите к оформлению заказа")}
            />

            <div className="popular-services-grid">
                {popularServices.map((service) => (
                    <Link
                        className="popular-service-card popular-service-card--link"
                        key={service.id}
                        to={`/catalog?platform=${encodeURIComponent(service.id)}`}
                    >
                        <div className="popular-service-icon" aria-hidden="true">
                            {service.icon ? <img src={service.icon} alt="" /> : <span>S</span>}
                        </div>
                        <h3>{t(service.name)}</h3>
                        <span className="popular-service-count">
                            {serviceCounts[service.id] ?? 0} {t("услуг")}
                        </span>
                    </Link>
                ))}
                <article className="popular-service-card popular-service-card--catalog">
                    <Link className="button button-outline" to="/catalog">
                        <span>{t("Открыть полный")}</span>
                        <span>{t("каталог")}</span>
                    </Link>
                </article>
            </div>
        </section>
    );
}
