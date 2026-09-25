import logo from "../../../../assets/logo.png";
import { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../../../../ui/Modal";
import HeroRegisterForm from "../Hero/HeroRegisterForm";
import "./css/Header.css";

export default function Header({
    showAuthButton = false,
    initiallyDark = false,
    actionLabel = "Авторизация",
    onAction,
}) {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const isLanding = window.location.pathname === "/";
    const sectionLink = (section) => isLanding ? `#${section}` : `/#${section}`;

    function handleAction() {
        if (onAction) {
            onAction();
            return;
        }
        setIsAuthModalOpen(true);
    }

    return (
        <>
            <header className={`site-header container ${initiallyDark ? "site-header--initial" : ""}`}>

            <Link
                to="/"
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
            </Link>

            <nav className="main-nav">

                <a href={sectionLink("services")}>
                    Услуги
                </a>

                <a href={sectionLink("prices")}>
                    Цены
                </a>

                <a href={sectionLink("how")}>
                    Как это работает
                </a>

                <Link to="/reviews">
                    Отзывы
                </Link>

                <Link to="/faq">
                    FAQ
                </Link>

                <a href={sectionLink("support")}>
                    Поддержка
                </a>

            </nav>
            <div className="header-actions">
                <button
                    type="button"
                    className={`button button-gold ${showAuthButton ? "is-visible" : ""}`}
                    onClick={handleAction}
                    tabIndex={showAuthButton ? 0 : -1}
                >
                    <span className="button-label">
                        {actionLabel}
                    </span>
                </button>
            </div>

            </header>

            {isAuthModalOpen && (
                <Modal title="Авторизация" onClose={() => setIsAuthModalOpen(false)}>
                    <HeroRegisterForm />
                </Modal>
            )}
        </>
    );
}
