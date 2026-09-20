import { useState } from "react";
import LoginForm from "./auth/LoginForm";
import RegisterForm from "./auth/RegisterForm";
import "./css/auth-panel/HeroAuthPanel.css";
import "./css/auth-panel/HeroAuthForm.css";

export default function HeroRegisterForm({ onAuthSuccess }) {
    const [mode, setMode] = useState("login");
    const [login, setLogin] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [passwordHint, setPasswordHint] = useState("");
    const [emailHint, setEmailHint] = useState("");

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
                        onModeChange={() => setMode("register")}
                        showModeSwitch
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
                        setIsAuth={() => { }}
                        onAuthSuccess={onAuthSuccess}
                        onModeChange={() => setMode("login")}
                        showModeSwitch
                    />
                )}
            </section>
        </div>
    );
}
