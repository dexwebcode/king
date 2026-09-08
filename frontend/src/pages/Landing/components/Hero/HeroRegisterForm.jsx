import { useState } from "react";
import LoginForm from "./auth/LoginForm";
import "./css/auth-panel/HeroAuthForm.css";

export default function HeroRegisterForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

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
                    showModeSwitch={false}
                />
            </section>
        </div>
    );
}
