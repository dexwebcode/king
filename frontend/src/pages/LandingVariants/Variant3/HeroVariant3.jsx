import HeroRegisterForm from "../../Landing/components/Hero/HeroRegisterForm";
import "../../Landing/components/Hero/Hero.css";
import "../../Landing/components/Hero/Visual.css";

export default function HeroVariant3({ isOrderGuideActive = false }) {
    return (
        <section className={`hero container ${isOrderGuideActive ? "hero--order-guide" : ""}`}>
            <div className="hero-content">
                <div className="hero-copy">
                    <h1>
                        <span className="hero-title-king">KING</span>
                        <span className="hero-title-promotion">PROMOTION</span>
                    </h1>

                    <p className="hero-subtitle">
                        Третий вариант лендинга. Здесь можно полностью менять
                        структуру, текст, блоки и расположение независимо от
                        первых двух страниц.
                    </p>

                    <div className="hero-actions">
                        <a className="button button-gold hero-action-primary" href="#quick-order">
                            <span className="button-label">Быстрый заказ</span>
                        </a>

                        <a className="button button-outline" href="#prices">
                            <span className="button-label">Каталог</span>
                        </a>
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
