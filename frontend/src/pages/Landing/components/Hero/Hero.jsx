import HeroRegisterForm from "./HeroRegisterForm";
import { useRef, useState } from "react";
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

import startIcon from "../../../../assets/icons/start.png";
import helpIcon from "../../../../assets/icons/help.png";
import securityIcon from "../../../../assets/icons/security.png";
import instagramIcon from "../../../../assets/social_icons/instagram.svg";
import telegramIcon from "../../../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../../../assets/social_icons/tiktok.svg";
import vkIcon from "../../../../assets/social_icons/vk.svg";
import youtubeIcon from "../../../../assets/social_icons/youtube.svg";
import rutubeIcon from "../../../../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import spotifyIcon from "../../../../assets/social_icons/Spotify.png";
import dzenIcon from "../../../../assets/social_icons/dzen.svg";
import maxIcon from "../../../../assets/social_icons/max.svg";
import soundcloudIcon from "../../../../assets/social_icons/soundcloud.png";
import twitchIcon from "../../../../assets/social_icons/twich.png";
import yandexMusicIcon from "../../../../assets/social_icons/yandex-music.png";

const heroBenefits = [
    {
        icon: startIcon,
        text: "Старт от 100 ₽",
        description: "Минимальная сумма заказа подходит для быстрого теста продвижения.",
    },
    {
        icon: helpIcon,
        text: "Поддержка\nкруглосуточно",
        description: "Помогаем разобраться с заказом и подскажем лучший вариант услуги.",
    },
    {
        icon: securityIcon,
        text: "Безопасность и надежность",
        description: "Заказы проходят аккуратно, а статус можно отслеживать после оформления.",
    },
];

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
    { name: "SoundCloud", icon: soundcloudIcon },
    { name: "Twitch", icon: twitchIcon },
    { name: "Yandex Music", icon: yandexMusicIcon },
];

export default function Hero({
    isOrderGuideActive = false,
    initialAuthMode = "register",
    onQuickOrderClick,
}) {
    const reviewTextRef = useRef(null);
    const [reviewScrollProgress, setReviewScrollProgress] = useState(0);

    function handleQuickOrderClick(event) {
        if (!onQuickOrderClick) {
            return;
        }

        event.preventDefault();
        onQuickOrderClick();
    }

    function handleReviewScroll(event) {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        const maxScroll = scrollHeight - clientHeight;

        setReviewScrollProgress(maxScroll > 0 ? scrollTop / maxScroll : 0);
    }

    function scrollReviewFromPointer(clientY, trackElement) {
        const reviewText = reviewTextRef.current;

        if (!reviewText) {
            return;
        }

        const track = trackElement.getBoundingClientRect();
        const thumbHeight = 42;
        const maxThumbTop = Math.max(track.height - thumbHeight, 1);
        const pointerTop = event.clientY - track.top - thumbHeight / 2;
        const progress = Math.min(Math.max(pointerTop / maxThumbTop, 0), 1);
        const maxScroll = reviewText.scrollHeight - reviewText.clientHeight;

        reviewText.scrollTop = maxScroll * progress;
        setReviewScrollProgress(progress);
    }

    function handleReviewScrollPointerDown(event) {
        event.preventDefault();
        const trackElement = event.currentTarget;

        scrollReviewFromPointer(event.clientY, trackElement);

        function handlePointerMove(moveEvent) {
            scrollReviewFromPointer(moveEvent.clientY, trackElement);
        }

        function handlePointerUp() {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        }

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
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

                            <div className="hero-benefit-rotator" aria-label="Преимущества">
                                {heroBenefits.map((benefit) => (
                                    <div className="hero-benefit-slide" key={benefit.text}>
                                        <div className="hero-benefit-heading">
                                            <img className="hero-benefit-icon" src={benefit.icon} alt="" aria-hidden="true" />
                                            <span>{benefit.text}</span>
                                        </div>
                                        <p>{benefit.description}</p>
                                    </div>
                                ))}

                                <div className="hero-benefit-indicator" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            <div className="hero-visual">
                <div className="hero-form-column">
                    <HeroRegisterForm initialMode={initialAuthMode} />
                </div>
            </div>
            <Stats />
        </section>
    );
}
