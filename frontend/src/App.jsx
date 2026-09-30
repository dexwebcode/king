import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import Landing from "./pages/Landing/Landing";
import Catalog from "./pages/Catalog/Catalog";
import Main from "./pages/Main/Main";
import Payment from "./pages/Payment/Payment";
import AdminApp from "./pages/Admin/AdminApp";
import Reviews from "./pages/Reviews/Reviews";
import SupportPage from "./pages/Support/SupportPage";
import TicketPage from "./pages/Support/TicketPage";
import AccountPage from "./pages/Account/AccountPage";

import { AUTH_CHANGED_EVENT, isAuth } from "./pages/Landing/components/Hero/auth/authApi";
import { getAccount, getAccountDetails, getPrices } from "./ui/dataCache";
import { trackPageView } from "./ui/traffic";

const RETRY_DELAY_MS = 3000;

/* Отправляет событие pageview при каждой смене маршрута.
   Минимальная аналитика: только открытие страницы, без лишних запросов. */
function PageViewTracker() {
    const location = useLocation();
    useEffect(() => {
        trackPageView(location.pathname);
    }, [location.pathname]);
    return null;
}

export default function App() {
    const [authChecked, setAuthChecked] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [offline, setOffline] = useState(false);
    const retryTimer = useRef(null);

    useEffect(() => {
        let isMounted = true;

        getPrices().catch(() => {});
        if (localStorage.getItem("token")) {
            getAccount().catch(() => {});
            getAccountDetails().catch(() => {});
        }

        async function verifyAuth() {
            const authStatus = await isAuth();

            if (!isMounted) {
                return;
            }

            if (authStatus === null) {
                // Нет связи: не выходим из аккаунта. Оставляем оптимистичную
                // сессию (если есть токен) и повторяем проверку после паузы.
                setOffline(true);
                if (localStorage.getItem("token")) {
                    setIsAuthenticated(true);
                }
                setAuthChecked(true);
                if (retryTimer.current) window.clearTimeout(retryTimer.current);
                retryTimer.current = window.setTimeout(verifyAuth, RETRY_DELAY_MS);
                return;
            }

            setOffline(false);
            setIsAuthenticated(authStatus);
            setAuthChecked(true);
        }

        function handleAuthChanged() {
            const hasToken = Boolean(localStorage.getItem("token"));

            // Обновляем защищенные маршруты до перехода формы на /main.
            setIsAuthenticated(hasToken);
            setAuthChecked(true);
            if (hasToken) setOffline(false);

            if (hasToken) {
                // Вход: сразу прогреваем кэш, чтобы страницы не грузились повторно.
                getAccount().catch(() => {});
                getAccountDetails().catch(() => {});
                verifyAuth();
            }
        }

        verifyAuth();
        window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);

        return () => {
            isMounted = false;
            window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
            if (retryTimer.current) window.clearTimeout(retryTimer.current);
        };
    }, []);

    useEffect(() => {
        if (authChecked) {
            const totalMs = Math.round(performance.now() - (window.__BOOT_START || 0));
            console.info(`[boot] App ready in ${totalMs} ms`);
        }
    }, [authChecked]);

    if (!authChecked) {
        return (
            <div className="boot-loader" role="status" aria-busy="true">
                <div className="boot-loader__bar"></div>
                <div className="boot-loader__spinner"></div>
                <p className="boot-loader__text">Загрузка…</p>
            </div>
        );
    }

    return (
        <>
            <PageViewTracker />
            {offline && (
                <div
                    role="alert"
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 10000,
                        background: "#f59e0b",
                        color: "#1f2937",
                        padding: "8px 16px",
                        textAlign: "center",
                        fontSize: "14px",
                    }}
                >
                    Нет соединения. Проверка будет повторена.
                </div>
            )}
            <Routes>
            <Route
                path="/"
                element={isAuthenticated ? <Navigate to="/catalog" replace /> : <Landing />}
            />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/reviews" element={<Reviews isAuthenticated={isAuthenticated} />} />
            <Route
                path="/payment/pending"
                element={isAuthenticated ? <Payment /> : <Navigate to="/" replace />}
            />
            <Route
                path="/payment/success"
                element={isAuthenticated ? <Payment /> : <Navigate to="/" replace />}
            />
            <Route
                path="/main"
                element={isAuthenticated ? <Main /> : <Navigate to="/" replace />}
            />
            <Route
                path="/account"
                element={isAuthenticated ? <AccountPage /> : <Navigate to="/" replace />}
            />
            <Route
                path="/admin/*"
                element={isAuthenticated ? <AdminApp /> : <Navigate to="/" replace />}
            />
            <Route
                path="/support"
                element={isAuthenticated ? <SupportPage /> : <Navigate to="/" replace />}
            />
            <Route
                path="/support/:publicId"
                element={isAuthenticated ? <TicketPage /> : <Navigate to="/" replace />}
            />
        </Routes>
        </>
    );
}
