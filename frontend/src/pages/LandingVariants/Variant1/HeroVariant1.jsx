import HeroRegisterForm from "../../Landing/components/Hero/HeroRegisterForm";
import "../../Landing/components/Hero/Hero.css";
import "../../Landing/components/Hero/Visual.css";
import instagram from "../../../assets/social_icons/instagram.svg";
import youtube from "../../../assets/social_icons/youtube.svg";
import tiktok from "../../../assets/social_icons/tiktok.svg";
import telegram from "../../../assets/social_icons/telegram.svg";
import vk from "../../../assets/social_icons/vk.svg";
import x from "../../../assets/social_icons/x.svg";

const supportedPlatforms = [
    { name: "Instagram", icon: instagram },
    { name: "YouTube", icon: youtube },
    { name: "TikTok", icon: tiktok },
    { name: "Telegram", icon: telegram },
    { name: "VK", icon: vk },
    { name: "X", icon: x },
];

export default function HeroVariant1({ isOrderGuideActive = false }) {
    return (
        <section className={`hero container ${isOrderGuideActive ? "hero--order-guide" : ""}`}>
            <div className="hero-content">
                <div className="hero-copy">
                    <h1>
                        <span className="hero-title-king">KING</span>
                        <span className="hero-title-promotion">PROMOTION</span>
                    </h1>

                    <p className="hero-subtitle">
                        Продвигайте аккаунты быстрее без сложных настроек.
                        Тысячи клиентов уже получают подписчиков,
                        просмотры и активность с нами.
                    </p>

                    <div className="hero-actions">
                        <a className="button button-gold hero-action-primary" href="#quick-order">
                            <span className="button-label">Быстрый заказ</span>
                        </a>

                        <a className="button button-outline" href="#prices">
                            <span className="button-label">Каталог</span>
                        </a>
                    </div>

                    <div className="hero-platforms" aria-label="Поддерживаемые площадки">
                        <div className="hero-platform-list">
                            {supportedPlatforms.map((platform) => (
                                <span className="hero-platform-item" key={platform.name}>
                                    <img src={platform.icon} alt={platform.name} />
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="hero-visual">
                <div className="hero-form-column">
                    <HeroRegisterForm initialMode="register" />
                </div>
            </div>
        </section>
    );
}
