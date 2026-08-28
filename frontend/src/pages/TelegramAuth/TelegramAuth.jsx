import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import telegramIcon from "../../assets/social_icons/telegram.svg";
import { completeTelegramRegister } from "../Landing/components/Hero/auth/authApi";
import "./TelegramAuth.css";


export default function TelegramAuth() {
    const location = useLocation();
    const navigate = useNavigate();
    const [token] = useState(location.state?.token || "");
    const [suggestedLogin] = useState(location.state?.suggestedLogin || "");
    const [login, setLogin] = useState(location.state?.suggestedLogin || "");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        window.history.replaceState({}, document.title);
    }, []);

    if (!token) {
        return <Navigate to="/" replace />;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!login.trim() || !password) {
            setMessage("Введите логин и пароль");
            return;
        }

        if (password !== repeatPassword) {
            setMessage("Пароли не совпадают");
            return;
        }

        try {
            setIsSubmitting(true);
            setMessage("");

            const response = await completeTelegramRegister(
                token,
                login.trim(),
                password
            );

            if (!response.ok) {
                setMessage(response.data?.detail || "Не удалось завершить вход");
                return;
            }

            navigate("/main", { replace: true });

        } catch (error) {
            console.log("Ошибка завершения Telegram авторизации:", error);
            setMessage("Не удалось подключиться к серверу");

        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="telegram-auth-page">
            <section className="telegram-auth-card">
                <div className="telegram-auth-icon">
                    <img src={telegramIcon} alt="" aria-hidden="true" />
                </div>

                {suggestedLogin && (
                    <p className="telegram-auth-eyebrow">
                        <p className="telegram-auth-login-hint">
                            Ваш аккаунт в Telegram {suggestedLogin}
                            <span> подтвержден</span>
                        </p>
                    </p>
                )}

                <p className="telegram-auth-note">
                    Вы можете поменять логин по желанию.
                </p>

                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="Введите логин"
                        value={login}
                        onChange={(event) => setLogin(event.target.value)}
                    />

                    <input
                        type="password"
                        placeholder="Введите пароль"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                    />

                    <input
                        type="password"
                        placeholder="Повторите пароль"
                        value={repeatPassword}
                        onChange={(event) => setRepeatPassword(event.target.value)}
                    />

                    {message && (
                        <p className="telegram-auth-message">
                            {message}
                        </p>
                    )}

                    <button
                        className="telegram-auth-submit"
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Сохраняем..." : "Продолжить"}
                    </button>
                    <p className="telegram-auth-copy">
                        Мы создадим аккаунт в сети KingPromotion с вашим логином из Telegram.
                    </p>
                </form>
            </section>
        </main>
    );
}
