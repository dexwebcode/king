import logo from "../../../../assets/logo.png";
import { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../../../../ui/Modal";
import { useLanguage } from "../../../../ui/i18n";
import HeroRegisterForm from "../Hero/HeroRegisterForm";
import "./css/Header.css";

export default function Header({
    showAuthButton = false,
    initiallyDark = false,
    actionLabel = "Авторизация",
    onAction,
}) {
    const { t } = useLanguage();
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
                aria-label={t("KingPromotion")}
            >
                <img
                    src={logo}
                    alt={t("KingPromotion")}
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
                    {t("Услуги")}
                </a>

                <a href={sectionLink("prices")}>
                    {t("Цены")}
                </a>

                <a href={sectionLink("how")}>
                    {t("Как это работает")}
                </a>

                <Link to="/reviews">
                    {t("Отзывы")}
                </Link>

                <Link to="/faq">
                    {t("FAQ")}
                </Link>

                <a href={sectionLink("support")}>
                    {t("Поддержка")}
                </a>

            </nav>
            <div className="header-actions">
                <button
                    type="button"
                    className="button button-gold"
                    onClick={handleAction}
                >
                    <span className="button-label">
                        {t(actionLabel)}
                    </span>
                </button>
            </div>

            </header>

            {isAuthModalOpen && (
                <Modal title={t("Авторизация")} onClose={() => setIsAuthModalOpen(false)}>
                    <HeroRegisterForm />
                </Modal>
            )}
        </>
    );
}
