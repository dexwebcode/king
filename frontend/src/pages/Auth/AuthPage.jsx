import { Link } from "react-router-dom";
import { useState } from "react";

import logo from "../../assets/logo.png";
import LoginForm from "../Landing/components/Hero/auth/LoginForm";
import RegisterForm from "../Landing/components/Hero/auth/RegisterForm";
import "../Landing/components/Hero/css/auth-panel/HeroAuthForm.css";
import "../Landing/components/Hero/css/auth-panel/HeroAuthPanel.css";
import "./AuthPage.css";


export default function AuthPage({ mode }) {
    const [identifier, setIdentifier] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [passwordHint, setPasswordHint] = useState("");
    const [emailHint, setEmailHint] = useState("");
    const isLogin = mode === "login";

    return (
        <main className="auth-page">
            <Link className="auth-page-brand" to="/" aria-label="KingPromotion — на главную">
                <img src={logo} alt="" />
                <span><strong>KING</strong><small>PROMOTION</small></span>
            </Link>

            <section className="hero-auth-panel auth-page-panel">
                <div className="login-card-header hero-auth-panel-header">
                    <p>{isLogin ? "С возвращением" : "Новый аккаунт"}</p>
                    <h1>{isLogin ? "Вход" : "Регистрация"}</h1>
                </div>

                <div className="Registration-content">
                    {isLogin ? (
                        <LoginForm
                            login={identifier}
                            password={password}
                            setLogin={setIdentifier}
                            setPassword={setPassword}
                            setIsAuth={() => {}}
                            expandedSocialButtons
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
                        />
                    )}
                </div>
            </section>
        </main>
    );
}
