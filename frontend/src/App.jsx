import { Routes, Route } from "react-router-dom";

import LandingVariant1 from "./pages/LandingVariants/Variant1/LandingVariant1";
import LandingVariant2 from "./pages/LandingVariants/Variant2/LandingVariant2";
import LandingVariant3 from "./pages/LandingVariants/Variant3/LandingVariant3";
import Auth from "./pages/Auth/Auth"
import Main from "./pages/Main/Main";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<LandingVariant1 />} />
            <Route path="/variant-2" element={<LandingVariant2 />} />
            <Route path="/variant-3" element={<LandingVariant3 />} />
            <Route path="/login" element={<Auth initialMode="login" />} />
            <Route path="/register" element={<Auth initialMode="register" />} />
            <Route path="/main" element={<Main />} />
        </Routes>
    );
}
