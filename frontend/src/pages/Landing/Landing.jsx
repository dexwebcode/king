import Header from "./components/Header/Header";
import Hero from "./components/Hero/Hero";
import OrderCard from "./components/OrderCard/OrderCard";
import HowItWorks from "./components/HowItWorks/HowItWorks";
import Benefits from "./components/Benefits/Benefits";
import PopularServices from "./components/PopularServices/PopularServices";
import TestBanner from "./components/TestBanner/TestBanner";
import Reliability from "./components/Reliability/Reliability";
import FinalCTA from "./components/FinalCTA/FinalCTA";
import Footer from "./components/Footer/Footer";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";

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
    const location = useLocation();
    const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
    const [isHeroAuthVisible, setIsHeroAuthVisible] = useState(true);
    const [authMode, setAuthMode] = useState(
        location.state?.authMode === "login" ? "login" : "register"
    );

    useLayoutEffect(() => {
        function resetScrollToTop() {
            if (window.location.hash) {
                window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}`
                );
            }

            window.scrollTo({
                top: 0,
                left: 0,
                behavior: "auto",
            });
        }

        if ("scrollRestoration" in window.history) {
            window.history.scrollRestoration = "manual";
        }

        resetScrollToTop();

        const animationFrameId = requestAnimationFrame(resetScrollToTop);
        const timeoutId = window.setTimeout(resetScrollToTop, 80);

        window.addEventListener("pageshow", resetScrollToTop);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.clearTimeout(timeoutId);
            window.removeEventListener("pageshow", resetScrollToTop);
        };
    }, []);

    useLayoutEffect(() => {
        const sections = Array.from(
            document.querySelectorAll(".page-shell > main > section, .page-shell > footer")
        );
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        sections.forEach((section) => section.classList.add("landing-section-reveal"));

        if (prefersReducedMotion) {
            sections.forEach((section) => section.classList.add("landing-section-reveal--visible"));
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    entry.target.classList.add("landing-section-reveal--visible");
                    observer.unobserve(entry.target);
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -8% 0px",
            }
        );

        sections.forEach((section) => observer.observe(section));

        return () => {
            observer.disconnect();
        };
    }, []);

    function getLayoutTop(element) {
        let top = 0;
        let currentElement = element;

        while (currentElement) {
            top += currentElement.offsetTop;
            currentElement = currentElement.offsetParent;
        }

        return top;
    }

    function scrollToOrderCard() {
        const orderSection = document.getElementById("quick-order");

        if (!orderSection) {
            return;
        }

        const header = document.querySelector(".site-header");
        const headerHeight = header?.getBoundingClientRect().height || 0;

        window.scrollTo({
            top: Math.max(0, getLayoutTop(orderSection) - headerHeight),
            behavior: "smooth",
        });
    }

    function handlePopularServiceSelect(preset) {
        localStorage.setItem("king_order_prefill", JSON.stringify(preset));
        window.dispatchEvent(new CustomEvent("king:order-prefill", { detail: preset }));
        scrollToOrderCard();
    }

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

    useEffect(() => {
        const authPanel = document.querySelector(".hero-auth-panel");

        if (!authPanel) {
            return undefined;
        }

        const observer = new IntersectionObserver(
            ([entry]) => setIsHeroAuthVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );

        observer.observe(authPanel);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="page-shell">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <Header onAuthModeChange={setAuthMode} showAuthButton={!isHeroAuthVisible} />

            <main id="top">
                <Hero initialAuthMode={authMode} onQuickOrderClick={scrollToOrderCard} />
                <section className="landing-order-card-section container" id="quick-order">
                    <OrderCard />
                </section>
                <HowItWorks />
                <Benefits />
                <PopularServices onSelectService={handlePopularServiceSelect} />
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
