import HeroRegisterForm from "./HeroRegisterForm";
import "./css/layout/HeroLayout.css";
import "./css/content/HeroCopy.css";
import "./css/content/HeroTitle.css";
import "./css/content/HeroSubtitle.css";
import "./css/actions/HeroActions.css";
import "./css/benefits/HeroBenefits.css";
import "./css/platforms/HeroPlatforms.css";
import "./css/auth-panel/HeroAuthPanel.css";
import "./css/responsive/HeroResponsive.css";
import "./css/Visual.css";
import instagram from "../../../../assets/social_icons/instagram.svg";
import youtube from "../../../../assets/social_icons/youtube.svg";
import tiktok from "../../../../assets/social_icons/tiktok.svg";
import telegram from "../../../../assets/social_icons/telegram.svg";
import vk from "../../../../assets/social_icons/vk.svg";
import x from "../../../../assets/social_icons/x.svg";
import startIcon from "../../../../assets/icons/start.png";
import helpIcon from "../../../../assets/icons/help.png";
import securityIcon from "../../../../assets/icons/security.png";

const supportedPlatforms = [
    { name: "Instagram", icon: instagram },
    { name: "VK", icon: vk },
    { name: "X", icon: x },
    { name: "TikTok", icon: tiktok },
    { name: "Telegram", icon: telegram },
    { name: "YouTube", icon: youtube },
];

const heroBenefits = [
    { icon: startIcon, text: "Старт от 100 рублей" },
    { icon: helpIcon, text: "Поддержка 24/7" },
    { icon: securityIcon, text: "Безопасность и надежность" },
];

export default function Hero({
    isOrderGuideActive = false,
    initialAuthMode = "register",
    onQuickOrderClick,
}) {
    function handleQuickOrderClick(event) {
        if (!onQuickOrderClick) {
            return;
        }

        event.preventDefault();
        onQuickOrderClick();
    }

    return (
        <section className={`hero hero--left container ${isOrderGuideActive ? "hero--order-guide" : ""}`}>
            <div className="hero-content">
                <div className="hero-copy">
                    <h1 className="hero-main-title">
                        <span>Продвигайте ваши</span>
                        <span>социальные сети быстрее </span>
                        <span>дешевле и эффективнее</span>
                    </h1>

                    <p className="hero-subtitle">
                        Тысячи клиентов уже получают подписчиков,
                        просмотры и активность с нами.
                    </p>

                    <div className="hero-actions">
                        <a
                            className="button button-gold hero-action-primary"
                            href="#quick-order"
                            onClick={handleQuickOrderClick}
                        >
                            <span className="button-label">Быстрый заказ</span>
                        </a>

                        <a className="button button-outline" href="#prices">
                            <span className="button-label">Каталог</span>
                        </a>
                    </div>

                    <div className="hero-benefits" aria-label="Преимущества">
                        {heroBenefits.map((benefit) => (
                            <div className="hero-benefit" key={benefit.text}>
                                <img className="hero-benefit-icon" src={benefit.icon} alt="" aria-hidden="true" />
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
                    <HeroRegisterForm initialMode={initialAuthMode} />
                </div>
            </div>
        </section>
    );
}
