import HeroRegisterForm from "./HeroRegisterForm";
import { Link } from "react-router-dom";
import { useLanguage } from "../../../../ui/i18n";
import Stats from "../Stats/Stats";
import "./css/layout/HeroLayout.css";
import "./css/content/HeroCopy.css";
import "./css/content/HeroTitle.css";
import "./css/content/HeroSubtitle.css";
import "./css/actions/HeroActions.css";
import "./css/benefits/HeroBenefits.css";
import "./css/platforms/HeroPlatforms.css";
import "./css/auth-panel/HeroAuthPanel.css";
import "./css/Visual.css";

export default function Hero({
    isOrderGuideActive = false,
    onQuickOrderClick,
}) {
    const { t } = useLanguage();

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
                        <span>{t("Продвигайте")}</span>
                        <span>{t("аккаунты быстрее")}</span>
                        <span>{t("без сложных настроек")}</span>
                    </h1>

                    <p className="hero-subtitle">
                        {t("Тысячи клиентов уже получают подписчиков, просмотры и")}{" "}
                        <span className="hero-subtitle-nowrap">{t("активность с нами.")}</span>
                    </p>
                    <div className="hero-actions">
                        <div className="hero-actions-top">
                            <a
                                className="button button-gold hero-action-primary"
                                href="#quick-order"
                                onClick={handleQuickOrderClick}
                            >
                                <span className="button-label">{t("Быстрый заказ")}</span>
                            </a>
                            <Link className="button hero-action-catalog" to="/catalog">
                                <span className="button-label">{t("Каталог услуг")}</span>
                            </Link>
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
