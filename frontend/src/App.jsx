import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing/Landing";
import Auth from "./pages/Auth/Auth"
import Main from "./pages/Main/Main";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Auth initialMode="login" />} />
            <Route path="/register" element={<Auth initialMode="register" />} />
            <Route path="/main" element={<Main />} />
        </Routes>
    );
}
