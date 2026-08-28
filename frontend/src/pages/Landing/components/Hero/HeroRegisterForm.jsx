import { useEffect, useState } from "react";
import LoginForm from "./auth/LoginForm";
import "./css/auth-panel/HeroAuthForm.css";

export default function HeroRegisterForm({ initialMode = "auth" }) {
    const [mode, setMode] = useState("email");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        setMode("email");
    }, [initialMode]);

    return (
        <div className="hero-auth-panel">
            <div className="login-card-header hero-auth-panel-header">
                <h2>
                    Авторизация
                </h2>
            </div>

            <section className="Registration-content">
                <LoginForm
                    login={email}
                    password={password}
                    setLogin={setEmail}
                    setPassword={setPassword}
                    setIsAuth={() => {}}
                    setMode={() => setMode(mode)}
                    showModeSwitch={false}
                    showSocialAuth={false}
                />
            </section>
        </div>
    );
}
