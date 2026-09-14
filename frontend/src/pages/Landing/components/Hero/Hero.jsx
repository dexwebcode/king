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


const heroBenefits = [
    { label: "Старт от 30 ₽", icon: "₽" },
    { label: "Поддержка 24/7", icon: "?" },
    { label: "Высокая скорость", icon: "⚡" },
];

export default function Hero({
    isOrderGuideActive = false,
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
                        <span>Продвигайте</span>
                        <span>аккаунты быстрее</span>
                        <span>без сложных настроек</span>
                    </h1>

                    <p className="hero-subtitle">
                        Тысячи клиентов уже получают подписчиков,
                        просмотры и <span className="hero-subtitle-nowrap">активность с нами.</span>
                    </p>
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
                        </div>
                        <div className="hero-benefit-grid" aria-label="Преимущества">
                            {heroBenefits.map(({ label, icon }) => (
                                <span className="hero-benefit-card" key={label}>
                                    <span className="hero-benefit-icon" aria-hidden="true">{icon}</span>
                                    <span>{label}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="hero-visual">
                <div className="hero-form-column">
                    <HeroRegisterForm />
                </div>
            </div>

            <Stats />
        </section>
    );
}
