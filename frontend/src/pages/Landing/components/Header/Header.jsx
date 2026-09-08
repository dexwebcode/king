import logo from "../../../../assets/logo.png";
import { useNavigate } from "react-router-dom";
import "./css/Header.css";

export default function Header({ showAuthButton = false, initiallyDark = false }) {
    const navigate = useNavigate();

    function goToAuth() {
        navigate("/login");
    }

    return (
        <header className={`site-header container ${initiallyDark ? "site-header--initial" : ""}`}>

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
                    className={`button button-gold ${showAuthButton ? "is-visible" : ""}`}
                    onClick={goToAuth}
                    tabIndex={showAuthButton ? 0 : -1}
                    aria-hidden={!showAuthButton}
                >
                    <span className="button-label">
                        Авторизация
                    </span>
                </button>
            </div>

        </header>
    );
}
