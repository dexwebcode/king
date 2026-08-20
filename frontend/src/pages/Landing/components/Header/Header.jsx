import logo from "../../../../assets/logo.png";
import { useLocation, useNavigate } from "react-router-dom";
import "./css/Header.css";

function scrollToTopFast() {
    const start = window.scrollY;
    const duration = 320;
    const startTime = performance.now();

    function animateScroll(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        window.scrollTo(0, start * (1 - easedProgress));

        if (progress < 1) {
            requestAnimationFrame(animateScroll);
        }
    }

    requestAnimationFrame(animateScroll);
}

export default function Header({ onAuthModeChange }) {
    const navigate = useNavigate();
    const location = useLocation();

    function goToAuth(mode) {
        onAuthModeChange?.(mode);

        if (location.pathname === "/") {
            scrollToTopFast();
            return;
        }

        navigate("/");
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
                    onClick={() => goToAuth("register")}
                >
                    <span className="button-label">
                        Регистрация
                    </span>
                </button>

                <button
                    type="button"
                    className="button button-gold"
                    onClick={() => goToAuth("login")}
                >
                    <span className="button-label">
                        Вход
                    </span>
                </button>

            </div>

        </header>
    );
}
