import { useState } from "react";
import ExperimentBar from "../../components/ExperimentBar/ExperimentBar";
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

import "./Landing.css";

export default function Landing({ variant = "variant-1" }) {
    const [isExperimentBarOpen, setIsExperimentBarOpen] = useState(false);

    return (
        <div className={`page-shell page-shell--${variant}`}>
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <Header
                isExperimentBarOpen={isExperimentBarOpen}
                onToggleExperimentBar={() => setIsExperimentBarOpen((isOpen) => !isOpen)}
            />
            <ExperimentBar isOpen={isExperimentBarOpen} />

            <main id="top">
                <Hero variant={variant} />
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
        </div>
    );
}
