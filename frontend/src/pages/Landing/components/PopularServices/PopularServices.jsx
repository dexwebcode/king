import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { SectionTitle } from "../../shared";
import { platformMeta, platformOrder } from "../../../../ui/catalogMeta";
import "./css/PopularServices.css";

const popularServices = platformOrder
    .map((id) => ({ id, ...platformMeta[id] }))
    .filter((service) => service.icon || service.id === "shazam");
const API_URL = import.meta.env.VITE_API_URL || "";

export default function PopularServices() {
    const [serviceCounts, setServiceCounts] = useState({});

    useEffect(() => {
        const controller = new AbortController();

        async function loadServiceCounts() {
            try {
                const response = await fetch(`${API_URL}/price`, { signal: controller.signal });
                const data = await response.json();

                if (!response.ok || !data?.success || !Array.isArray(data.items)) {
                    return;
                }

                const counts = data.items.reduce((result, item) => {
                    const platform = String(item.platform || item.soc || "").toLowerCase();
                    if (platform) result[platform] = (result[platform] || 0) + 1;
                    return result;
                }, {});

                setServiceCounts(counts);
            } catch (error) {
                if (error.name !== "AbortError") setServiceCounts({});
            }
        }

        loadServiceCounts();
        return () => controller.abort();
    }, []);

    return (
        <section className="container panel-section popular-services" id="prices">
            <SectionTitle
                title="Популярные сервисы"
                subtitle="Выберите площадку и перейдите к оформлению заказа"
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
                        <h3>{service.name}</h3>
                        <span className="popular-service-count">
                            {serviceCounts[service.id] ?? 0} услуг
                        </span>
                    </Link>
                ))}
                <article className="popular-service-card popular-service-card--catalog">
                    <Link className="button button-outline" to="/catalog">
                        <span>Открыть полный</span>
                        <span>каталог</span>
                    </Link>
                </article>
            </div>
        </section>
    );
}
