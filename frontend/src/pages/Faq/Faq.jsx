import { Link } from "react-router-dom";

import Header from "../Landing/components/Header/Header";
import Footer from "../Landing/components/Footer/Footer";
import { AppShell } from "../../ui/AppShell";
import "../Reviews/Reviews.css";

export default function Faq() {
    const hasSession = Boolean(localStorage.getItem("token"));
    const content = (
        <section className="reviews-placeholder" aria-labelledby="faq-title">
            <p className="reviews-placeholder-eyebrow">KingPromotion</p>
            <h1 id="faq-title">FAQ</h1>
            <p>Страница в разработке</p>
            <Link className="button button-outline" to="/">
                На главную
            </Link>
        </section>
    );

    return (
        <div className="reviews-page-shell">
            {hasSession ? (
                <AppShell contentClassName="reviews-page">{content}</AppShell>
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
