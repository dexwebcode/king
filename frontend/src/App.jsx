import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing/Landing";
import Main from "./pages/Main/Main";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Navigate to="/" replace state={{ authMode: "login" }} />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/main" element={<Main />} />
        </Routes>
    );
}
