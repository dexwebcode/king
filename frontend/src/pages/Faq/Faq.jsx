import { Link } from "react-router-dom";

import Header from "../Landing/components/Header/Header";
import Footer from "../Landing/components/Footer/Footer";
import { AppShell } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import "../Reviews/Reviews.css";

export default function Faq() {
    const { t } = useLanguage();
    const hasSession = Boolean(localStorage.getItem("token"));
    const content = (
        <section className="reviews-placeholder" aria-label={t("FAQ")}>
            <p className="reviews-placeholder-eyebrow">{t("KingPromotion")}</p>
            <p>{t("Страница в разработке")}</p>
            <Link className="button button-outline" to="/">
                {t("На главную")}
            </Link>
        </section>
    );

    return (
        <div className="reviews-page-shell">
            {hasSession ? (
                <AppShell active="faq" contentClassName="reviews-page" title={t("FAQ")}>{content}</AppShell>
            ) : (
                <>
                    <Header showAuthButton initiallyDark />
                    <main className="reviews-page container">{content}</main>
                </>
            )}
            <Footer />
        </div>
    );
}
