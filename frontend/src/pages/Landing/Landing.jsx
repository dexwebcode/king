import Header from "./components/Header/Header";
import Hero from "./components/Hero/Hero";
import OrderCard from "./components/OrderCard/OrderCard";
import Stats from "./components/Stats/Stats";
import QuickOrder from "./components/QuickOrder/QuickOrder";
import Platforms from "./components/Platforms/Platforms";
import HowItWorks from "./components/HowItWorks/HowItWorks";
import Benefits from "./components/Benefits/Benefits";
import PopularServices from "./components/PopularServices/PopularServices";
import TestBanner from "./components/TestBanner/TestBanner";
import Reliability from "./components/Reliability/Reliability";
import FinalCTA from "./components/FinalCTA/FinalCTA";
import Footer from "./components/Footer/Footer";
import { useEffect, useState } from "react";

import "./Landing.css";

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

export default function Landing() {
    const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
    const [authMode, setAuthMode] = useState("register");

    useEffect(() => {
        function handleScroll() {
            setIsScrollTopVisible(window.scrollY > 420);
        }

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, []);

    return (
        <div className="page-shell">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <Header onAuthModeChange={setAuthMode} />

            <main id="top">
                <Hero initialAuthMode={authMode} />
                <section className="landing-order-card-section container" id="quick-order">
                    <OrderCard />
                </section>
                <Stats />
                <QuickOrder />
                <Platforms />
                <HowItWorks />
                <Benefits />
                <PopularServices />
                <TestBanner />
                <Reliability />
                <FinalCTA />
            </main>

            <Footer />

            <button
                type="button"
                className={`scroll-top-button ${isScrollTopVisible ? "scroll-top-button--visible" : ""}`}
                aria-label="Вернуться наверх"
                onClick={scrollToTopFast}
            >
                ⌃
            </button>
        </div>
    );
}
