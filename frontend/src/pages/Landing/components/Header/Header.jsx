import logo from "../../../../assets/logo.png";
import "./Header.css";

export default function Header() {
    function goToAuth(path) {
        window.location.assign(path);
    }

    return (
        <header className="site-header container">

            <a
                href="/"
                className="brand"
                aria-label="KingPromotion"
            >
                <img
                    src={logo}
                    alt="KingPromotion"
                    width={40}
                    height={40}
                />

                <span>
                    <strong>KING</strong>
                    <small>PROMOTION</small>
                </span>
            </a>

            <nav className="main-nav">

                <a href="#services">
                    Услуги
                </a>

                <a href="#prices">
                    Цены
                </a>

                <a href="#how">
                    Как это работает
                </a>

                <a href="#reviews">
                    Отзывы
                </a>

                <a href="#faq">
                    FAQ
                </a>

                <a href="#support">
                    Поддержка
                </a>

            </nav>
            <div className="header-actions">

                <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => goToAuth("/login")}
                >
                    <span className="button-label">
                        Войти
                    </span>
                </button>

                <button
                    type="button"
                    className="button button-gold"
                >
                    <span className="button-label">
                        Оформить заказ
                    </span>
                </button>

            </div>

        </header>
    );
}
