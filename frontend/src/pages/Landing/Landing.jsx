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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    const [authMode, setAuthMode] = useState(
        location.state?.authMode === "login" ? "login" : "register"
    );
    const isOrderSnapLocked = useRef(false);
    const snapUnlockTimer = useRef(null);

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

    function unlockSnapAfterScroll() {
        if (snapUnlockTimer.current) {
            clearTimeout(snapUnlockTimer.current);
        }

        snapUnlockTimer.current = setTimeout(() => {
            isOrderSnapLocked.current = false;
            snapUnlockTimer.current = null;
        }, 850);
    }

    function getSectionTarget(section) {
        return section.querySelector(".order-card-scene") || section;
    }

    function getSectionScrollTop(section, direction) {
        const target = getSectionTarget(section);
        const targetRect = target.getBoundingClientRect();
        const targetTop = targetRect.top + window.scrollY;

        if (section === document.querySelector("main > section")) {
            return 0;
        }

        const scrollTop =
            targetTop - (window.innerHeight - targetRect.height) / 2;
        const scrollOffset = direction > 0 ? 50 : 0;

        return Math.max(0, scrollTop - scrollOffset);
    }

    function scrollToOrderCard() {
        const orderSection = document.getElementById("quick-order");

        if (!orderSection) {
            return;
        }

        isOrderSnapLocked.current = true;

        window.scrollTo({
            top: getSectionScrollTop(orderSection, 1),
            behavior: "smooth",
        });

        unlockSnapAfterScroll();
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
        function handleWheel(event) {
            if (isOrderSnapLocked.current) {
                event.preventDefault();
                return;
            }

            const sections = Array.from(document.querySelectorAll("main > section"));

            if (sections.length === 0) {
                return;
            }

            const direction = Math.sign(event.deltaY);

            if (direction === 0) {
                return;
            }

            const viewportCenter = window.scrollY + window.innerHeight / 2;
            const currentIndex = sections.reduce((closestIndex, section, index) => {
                const target = getSectionTarget(section);
                const targetRect = target.getBoundingClientRect();
                const targetCenter =
                    targetRect.top + window.scrollY + targetRect.height / 2;
                const closestTarget = getSectionTarget(sections[closestIndex]);
                const closestRect = closestTarget.getBoundingClientRect();
                const closestCenter =
                    closestRect.top + window.scrollY + closestRect.height / 2;

                return Math.abs(targetCenter - viewportCenter) <
                    Math.abs(closestCenter - viewportCenter)
                    ? index
                    : closestIndex;
            }, 0);

            const targetIndex = Math.max(
                0,
                Math.min(sections.length - 1, currentIndex + direction)
            );

            if (targetIndex === currentIndex) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            isOrderSnapLocked.current = true;

            window.scrollTo({
                top: getSectionScrollTop(sections[targetIndex], direction),
                behavior: "smooth",
            });

            unlockSnapAfterScroll();
        }

        window.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            if (snapUnlockTimer.current) {
                clearTimeout(snapUnlockTimer.current);
            }

            window.removeEventListener("wheel", handleWheel);
        };
    }, []);

    return (
        <div className="page-shell">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <Header onAuthModeChange={setAuthMode} />

            <main id="top">
                <Hero initialAuthMode={authMode} onQuickOrderClick={scrollToOrderCard} />
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
