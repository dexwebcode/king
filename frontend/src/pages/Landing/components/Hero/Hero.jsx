import HeroRegisterForm from "./HeroRegisterForm";
import "./Hero.css";
import "./Visual.css";
import instagram from "../../../../assets/social_icons/instagram.svg";
import youtube from "../../../../assets/social_icons/youtube.svg";
import tiktok from "../../../../assets/social_icons/tiktok.svg";
import telegram from "../../../../assets/social_icons/telegram.svg";
import vk from "../../../../assets/social_icons/vk.svg";
import x from "../../../../assets/social_icons/x.svg";
import instaDecor from "../../../../assets/insta.png";
import youtubeDecor from "../../../../assets/youtube.png";
import tiktokDecor from "../../../../assets/tiktok.png";
import telegramDecor from "../../../../assets/telegram.png";
import vkDecor from "../../../../assets/vk.png";
import xDecor from "../../../../assets/x.png";

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

const decorativeIcons = [
    { name: "Instagram", icon: instaDecor, className: "hero-decor-icon--insta" },
    { name: "YouTube", icon: youtubeDecor, className: "hero-decor-icon--youtube" },
    { name: "TikTok", icon: tiktokDecor, className: "hero-decor-icon--tiktok" },
    { name: "Telegram", icon: telegramDecor, className: "hero-decor-icon--telegram" },
    { name: "VK", icon: vkDecor, className: "hero-decor-icon--vk" },
    { name: "X", icon: xDecor, className: "hero-decor-icon--x" },
];

export default function Hero({
    isOrderGuideActive = false,
}) {
    return (
        <section className={`hero container ${isOrderGuideActive ? "hero--order-guide" : ""}`}>

            {/* ЛЕВАЯ ЧАСТЬ */}
            <div className="hero-content">

                {/* Заголовок */}
                <div className="hero-copy">
                    <div className="eyebrow">
                        Продвижение в социальных сетях
                    </div>

                    <h1>
                        KING
                        <span>PROMOTION</span>
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

                    <div className="hero-platforms" aria-label="Поддерживаемые площадки">
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


            {/* ПРАВАЯ ЧАСТЬ — РЕГИСТРАЦИЯ */}
            <div className="hero-visual">
                {decorativeIcons.map((item) => (
                    <img
                        className={`hero-decor-icon ${item.className}`}
                        src={item.icon}
                        alt=""
                        aria-hidden="true"
                        key={item.name}
                    />
                ))}
                <HeroRegisterForm />
            </div>

        </section>
    );
}
