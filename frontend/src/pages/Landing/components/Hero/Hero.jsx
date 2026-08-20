import HeroRegisterForm from "./HeroRegisterForm";
import "./css/layout/HeroLayout.css";
import "./css/content/HeroCopy.css";
import "./css/content/HeroTitle.css";
import "./css/content/HeroSubtitle.css";
import "./css/actions/HeroActions.css";
import "./css/benefits/HeroBenefits.css";
import "./css/platforms/HeroPlatforms.css";
import "./css/order-card/HeroOrderCard.css";
import "./css/responsive/HeroResponsive.css";
import "./css/Visual.css";
import instagram from "../../../../assets/social_icons/instagram.svg";
import youtube from "../../../../assets/social_icons/youtube.svg";
import tiktok from "../../../../assets/social_icons/tiktok.svg";
import telegram from "../../../../assets/social_icons/telegram.svg";
import vk from "../../../../assets/social_icons/vk.svg";
import x from "../../../../assets/social_icons/x.svg";

const supportedPlatforms = [
    { name: "Instagram", icon: instagram },
    { name: "YouTube", icon: youtube },
    { name: "TikTok", icon: tiktok },
    { name: "Telegram", icon: telegram },
    { name: "VK", icon: vk },
    { name: "X", icon: x },
];

const heroBenefits = [
    { icon: "₽", text: "Старт от 100 рублей" },
    { icon: "24/7", text: "Поддержка 24/7" },
    { icon: "✓", text: "Безопасность и надежность" },
];

export default function Hero({
    isOrderGuideActive = false,
}) {
    return (
        <section className={`hero hero--left container ${isOrderGuideActive ? "hero--order-guide" : ""}`}>
            <div className="hero-content">
                <div className="hero-copy">
                    <div className="eyebrow">
                        Продвижение в социальных сетях
                    </div>

                    <h1 className="hero-main-title">
                        Продвигайте свои социальные сети с KING PROMOTION
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

                    <div className="hero-benefits" aria-label="Преимущества">
                        {heroBenefits.map((benefit) => (
                            <div className="hero-benefit" key={benefit.text}>
                                <span className="hero-benefit-icon" aria-hidden="true">
                                    {benefit.icon}
                                </span>
                                <span>{benefit.text}</span>
                            </div>
                        ))}
                    </div>

                    <div className="hero-platforms hero-platforms--left" aria-label="Поддерживаемые площадки">
                        <h2>Поддерживаемые площадки</h2>

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
