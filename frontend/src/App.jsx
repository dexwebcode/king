import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Landing from "./pages/Landing/Landing";
import Catalog from "./pages/Catalog/Catalog";
import Main from "./pages/Main/Main";
import Payment from "./pages/Payment/Payment";
import Admin from "./pages/Admin/Admin";
import Reviews from "./pages/Reviews/Reviews";
import Faq from "./pages/Faq/Faq";
import { AUTH_CHANGED_EVENT, isAuth } from "./pages/Landing/components/Hero/auth/authApi";

export default function App() {
    const [authChecked, setAuthChecked] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function verifyAuth() {
            const authStatus = await isAuth();

            if (!isMounted) {
                return;
            }

            setIsAuthenticated(authStatus);
            setAuthChecked(true);
        }

        function handleAuthChanged() {
            const hasToken = Boolean(localStorage.getItem("token"));

            // Обновляем защищенные маршруты до перехода формы на /main.
            setIsAuthenticated(hasToken);
            setAuthChecked(true);

            if (hasToken) {
                verifyAuth();
            }
        }

        verifyAuth();
        window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);

        return () => {
            isMounted = false;
            window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
        };
    }, []);

    if (!authChecked) {
        return null;
    }

    return (
        <Routes>
            <Route
                path="/"
                element={isAuthenticated ? <Navigate to="/catalog" replace /> : <Landing />}
            />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/reviews" element={<Reviews isAuthenticated={isAuthenticated} />} />
            <Route path="/faq" element={<Faq />} />
            <Route
                path="/payment/success"
                element={isAuthenticated ? <Payment /> : <Navigate to="/" replace />}
            />
            <Route
                path="/main"
                element={isAuthenticated ? <Main /> : <Navigate to="/" replace />}
            />
            <Route
                path="/admin"
                element={isAuthenticated ? <Admin /> : <Navigate to="/" replace />}
            />
        </Routes>
    );
}
