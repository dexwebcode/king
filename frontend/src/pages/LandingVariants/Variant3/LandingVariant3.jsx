import { useState } from "react";
import ExperimentBar from "../../../components/ExperimentBar/ExperimentBar";
import Header from "../../Landing/components/Header/Header";
import OrderCard from "../../Landing/components/OrderCard/OrderCard";
import Stats from "../../Landing/components/Stats/Stats";
import QuickOrder from "../../Landing/components/QuickOrder/QuickOrder";
import Platforms from "../../Landing/components/Platforms/Platforms";
import HowItWorks from "../../Landing/components/HowItWorks/HowItWorks";
import Benefits from "../../Landing/components/Benefits/Benefits";
import PopularServices from "../../Landing/components/PopularServices/PopularServices";
import TestBanner from "../../Landing/components/TestBanner/TestBanner";
import Reliability from "../../Landing/components/Reliability/Reliability";
import FinalCTA from "../../Landing/components/FinalCTA/FinalCTA";
import Footer from "../../Landing/components/Footer/Footer";
import HeroVariant3 from "./HeroVariant3";
import "../../Landing/Landing.css";

export default function LandingVariant3() {
    const [isExperimentBarOpen, setIsExperimentBarOpen] = useState(false);

    return (
        <div className="page-shell page-shell--variant-3">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <Header
                isExperimentBarOpen={isExperimentBarOpen}
                onToggleExperimentBar={() => setIsExperimentBarOpen((isOpen) => !isOpen)}
            />
            <ExperimentBar isOpen={isExperimentBarOpen} />

            <main id="top">
                <HeroVariant3 />
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
