import { useEffect, useState } from "react";
import LoginForm from "./auth/LoginForm";
import RegisterForm from "./auth/RegisterForm";
import "./css/auth-panel/HeroAuthForm.css";

export default function HeroRegisterForm({ initialMode = "register" }) {
    const [mode, setMode] = useState(initialMode);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [emailHint, setEmailHint] = useState("");
    const [passwordHint, setPasswordHint] = useState("");

    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);

    return (
        <div className="hero-auth-panel">
            <div className="login-card-header hero-auth-panel-header">
                <h2>{mode === "login" ? "Вход в аккаунт" : "Регистрация"}</h2>
                <p>
                    {mode === "login"
                        ? "Введите свои данные для входа"
                        : "Создайте аккаунт для начала работы"}
                </p>
            </div>

            <section className="Registration-content">
                {mode === "login" ? (
                    <LoginForm
                        login={email}
                        password={password}
                        setLogin={setEmail}
                        setPassword={setPassword}
                        setIsAuth={() => {}}
                        setMode={setMode}
                    />
                ) : (
                    <RegisterForm
                        email={email}
                        password={password}
                        repeatPassword={repeatPassword}
                        passwordHint={passwordHint}
                        emailHint={emailHint}
                        setEmail={setEmail}
                        setPassword={setPassword}
                        setRepeatPassword={setRepeatPassword}
                        setPasswordHint={setPasswordHint}
                        setEmailHint={setEmailHint}
                        setIsAuth={() => {}}
                        setMode={setMode}
                    />
                )}
            </section>
        </div>
    );
}
