// ------ Импорт стилей компонента Auth ------ //
import './Auth.css'

// ------ Импорт React hooks ------ //
import { useEffect, useState } from 'react'

// ------ Импорт компонентов форм ------ //
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'

import logo from "../../assets/logo.png"
import { Link } from "react-router-dom"
/// ------ Главный компонент авторизации ------ ///
export default function Auth({ setIsAuth = () => {}, initialMode = 'login' }) {

    // ------ Режим формы: login/register ------ //
    const [mode, setMode] = useState(initialMode)

    // ------ Данные пользователя ------ //
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')

    // ------ Подсказки ------ //
    const [emailHint, setEmailHint] = useState('')
    const [passwordHint, setPasswordHint] = useState('')

    // ------ Функция очистки всех полей формы ------ //
    function clearFields() {

        setEmail('')
        setPassword('')
        setRepeatPassword('')

        setEmailHint('')
        setPasswordHint('')
    }

    // ------ Эффект очистки полей при смене режима ------ //
    useEffect(() => {
        clearFields()

    }, [mode])

    return (

        <section className="Auth">
            <div className="Auth-ambient Auth-ambient-one" />
            <div className="Auth-ambient Auth-ambient-two" />

            <header className="Auth-header container">
                <Link
                    to="/"
                    className="Auth-brand"
                    aria-label="KingPromotion"
                >
                    <img
                        src={logo}
                        alt="KingPromotion"
                        width={40}
                        height={40}
                    />

                    <span>
                        <strong>KING</strong>
                        <small>PROMOTION</small>
                    </span>
                </Link>
            </header>

            {/* ---------- КОНТЕЙНЕР ФОРМЫ ---------- */}
            <section className="Registration">

                {/* ---------- HEADING ---------- */}
                <h2 className="Registration-heading">
                    {mode === 'login' ? 'Вход' : 'Регистрация'}
                </h2>

                {/* ---------- КОНТЕНТ ФОРМЫ ---------- */}

                <section className="Registration-content">

                    {/* ---------- LOGIN FORM ---------- */}

                    {mode === 'login' ? (
                        <LoginForm
                            login={email}
                            password={password}

                            setLogin={setEmail}
                            setPassword={setPassword}

                            setIsAuth={setIsAuth}
                            setMode={setMode}
                        />

                    ) : (

                        /* ---------- REGISTER FORM ---------- */

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

                            setIsAuth={setIsAuth}
                            setMode={setMode}
                        />
                    )}

                </section>
                {mode === 'login' && (
                    <button
                        className="QR-button"
                        type="button"
                    >
                        Вход по QR-коду
                    </button>
                )}
            </section>

        </section >
    )
}
