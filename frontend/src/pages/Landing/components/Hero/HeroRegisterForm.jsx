import { useState } from "react";
import LoginForm from "../../../Auth/LoginForm";
import RegisterForm from "../../../Auth/RegisterForm";
import "../../../Auth/Auth.css";

export default function HeroRegisterForm() {
    const [mode, setMode] = useState("register");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [repeatPassword, setRepeatPassword] = useState("");
    const [emailHint, setEmailHint] = useState("");
    const [passwordHint, setPasswordHint] = useState("");

    return (
        <div className="hero-register-card">
            <div className="login-card-header hero-register-header">
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
