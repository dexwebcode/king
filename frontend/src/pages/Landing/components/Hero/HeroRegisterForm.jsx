import { useState } from "react";
import LoginForm from "./auth/LoginForm";
import RegisterForm from "./auth/RegisterForm";
import "./css/auth-panel/HeroAuthPanel.css";
import "./css/auth-panel/HeroAuthForm.css";

export default function HeroRegisterForm({ onAuthSuccess }) {
    const [mode, setMode] = useState("login");
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [passwordHint, setPasswordHint] = useState("");

    /* При переключении между входом и регистрацией поля полностью очищаются. */
    function handleModeChange(nextMode) {
        setLogin("");
        setPassword("");
        setRepeatPassword("");
        setPasswordHint("");
        setMode(nextMode);
    }

    return (
        <div className="hero-auth-panel">
            <div className="login-card-header hero-auth-panel-header">
                <h2>
                    {mode === "login" ? "Авторизация" : "Регистрация"}
                </h2>
            </div>

            <section className="Registration-content">
                {mode === "login" ? (
                    <LoginForm
                        login={login}
                        password={password}
                        setLogin={setLogin}
                        setPassword={setPassword}
                        setIsAuth={() => { }}
                        onAuthSuccess={onAuthSuccess}
                        onModeChange={() => handleModeChange("register")}
                        showModeSwitch
                    />
                ) : (
                    <RegisterForm
                        password={password}
                        repeatPassword={repeatPassword}
                        passwordHint={passwordHint}
                        setPassword={setPassword}
                        setRepeatPassword={setRepeatPassword}
                        setPasswordHint={setPasswordHint}
                        setIsAuth={() => { }}
                        onAuthSuccess={onAuthSuccess}
                        onModeChange={() => handleModeChange("login")}
                        showModeSwitch
                    />
                )}
            </section>
        </div>
    );
}
