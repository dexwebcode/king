import HeroRegisterForm from "./HeroRegisterForm";
import { Link } from "react-router-dom";
import Stats from "../Stats/Stats";
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

import instagramIcon from "../../../../assets/social_icons/instagram.svg";
import telegramIcon from "../../../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../../../assets/social_icons/tiktok.svg";
import vkIcon from "../../../../assets/social_icons/vk.svg";
import youtubeIcon from "../../../../assets/social_icons/youtube.svg";
import rutubeIcon from "../../../../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import spotifyIcon from "../../../../assets/social_icons/Spotify.png";
import dzenIcon from "../../../../assets/social_icons/dzen.svg";
import maxIcon from "../../../../assets/social_icons/max.svg";
import vkMusicIcon from "../../../../assets/social_icons/vk-music.svg";
import twitchIcon from "../../../../assets/social_icons/twich.png";
import appleMusicIcon from "../../../../assets/social_icons/Apple_Musikl.png";

const heroPlatforms = [
    { name: "Instagram", icon: instagramIcon },
    { name: "Telegram", icon: telegramIcon },
    { name: "TikTok", icon: tiktokIcon },
    { name: "VK", icon: vkIcon },
    { name: "YouTube", icon: youtubeIcon },
    { name: "RuTube", icon: rutubeIcon },
    { name: "Dzen", icon: dzenIcon },
    { name: "MAX", icon: maxIcon },
    { name: "Spotify", icon: spotifyIcon },
    { name: "VK Музыка", icon: vkMusicIcon },
    { name: "Twitch", icon: twitchIcon },
    { name: "Apple Music", icon: appleMusicIcon },
];

const heroBenefitCopy = [
    "Минимальная сумма заказа подходит для быстрого теста продвижения.",
    "Помогаем разобраться с заказом и подскажем лучший вариант услуги.",
    "Заказы проходят аккуратно, а статус можно отслеживать после оформления.",
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
                        <span>Мы продвинем ваши</span>
                        <span>социальные сети быстро</span>
                        <span>эффективно и дешево</span>
                    </h1>

                    <p className="hero-subtitle">
                        Тысячи клиентов уже получают подписчиков,
                        просмотры и <span className="hero-subtitle-nowrap">активность с нами.</span>
                    </p>
                    <div className="hero-supported-platforms" aria-label="Поддерживаемые площадки">

                        <div className="hero-supported-platforms-grid">
                            {heroPlatforms.map((platform) => (
                                <div className="hero-supported-platform" key={platform.name}>
                                    <img src={platform.icon} alt={platform.name} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hero-actions">
                        <div className="hero-actions-top">
                            <a
                                className="button button-gold hero-action-primary"
                                href="#quick-order"
                                onClick={handleQuickOrderClick}
                            >
                                <span className="button-label">Быстрый заказ</span>
                            </a>
                            <Link className="button hero-action-catalog" to="/catalog">
                                <span className="button-label">Каталог услуг</span>
                            </Link>
                            <div className="hero-benefit-rotator hero-benefit-rotator--copy" aria-label="Преимущества">
                                {heroBenefitCopy.map((text) => (
                                    <div className="hero-benefit-slide" key={text}>
                                        <p>{text}</p>
                                    </div>
                                ))}
                                <div className="hero-benefit-indicator" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            </div>
                            <Stats />

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
