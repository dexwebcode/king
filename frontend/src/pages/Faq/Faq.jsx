import { Link } from "react-router-dom";

import Header from "../Landing/components/Header/Header";
import Footer from "../Landing/components/Footer/Footer";
import "../Reviews/Reviews.css";

export default function Faq() {
    return (
        <div className="reviews-page-shell">
            <Header showAuthButton initiallyDark />
            <main className="reviews-page container">
                <section className="reviews-placeholder" aria-labelledby="faq-title">
                    <p className="reviews-placeholder-eyebrow">KingPromotion</p>
                    <h1 id="faq-title">FAQ</h1>
                    <p>Страница в разработке</p>
                    <Link className="button button-outline" to="/">
                        На главную
                    </Link>
                </section>
            </main>
            <Footer />
        </div>
    );
}
