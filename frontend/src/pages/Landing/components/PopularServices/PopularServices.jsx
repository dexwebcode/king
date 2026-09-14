import instagramIcon from "../../../../assets/social_icons/instagram.svg";
import telegramIcon from "../../../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../../../assets/social_icons/tiktok.svg";
import vkIcon from "../../../../assets/social_icons/vk.svg";
import youtubeIcon from "../../../../assets/social_icons/youtube.svg";
import rutubeIcon from "../../../../assets/social_icons/Icon_RUTUBE_dark_color.svg";

import { SectionTitle } from "../../shared";
import "./css/PopularServices.css";

const popularServices = [
    { id: "instagram", name: "Instagram", icon: instagramIcon },
    { id: "telegram", name: "Telegram", icon: telegramIcon },
    { id: "tiktok", name: "TikTok", icon: tiktokIcon },
    { id: "vk", name: "VK", icon: vkIcon },
    { id: "youtube", name: "YouTube", icon: youtubeIcon },
    { id: "rutube", name: "RuTube", icon: rutubeIcon },
];

export default function PopularServices({ onSelectService }) {
    return (
        <section className="container panel-section popular-services" id="prices">
            <SectionTitle
                title="Популярные сервисы"
                subtitle="Выберите площадку и перейдите к оформлению заказа"
            />

            <div className="popular-services-grid">
                {popularServices.map((service) => (
                    <article className="popular-service-card" key={service.id}>
                        <div className="popular-service-icon" aria-hidden="true">
                            <img src={service.icon} alt="" />
                        </div>
                        <h3>{service.name}</h3>
                        <button
                            className="button button-outline"
                            type="button"
                            onClick={() => onSelectService?.({ platform: service.id })}
                        >
                            Выбрать услуги
                        </button>
                    </article>
                ))}
            </div>
        </section>
    );
}
