// ------ Импорт стилей компонента Auth ------ //
import './Auth.css'

// ------ Импорт React hooks ------ //
import { useEffect, useState } from 'react'

// ------ Импорт компонентов форм ------ //
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'

import logo from "../../assets/logo.png"
/// ------ Главный компонент авторизации ------ ///
export default function Auth({ setIsAuth }) {

    // ------ Режим формы: login/register ------ //
    const [mode, setMode] = useState('login')

    // ------ Данные пользователя ------ //
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')

    // ------ Подсказки ------ //
    const [emailHint, setEmailHint] = useState('')
    const [passwordHint, setPasswordHint] = useState('')
    const logos = Array.from({ length: 22 })
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
            <header className="Auth-header">

                {logos.map((_, index) => (
                    <img
                        key={index}
                        src={logo}
                        alt="Logo"
                        className={index === 0 ? "Logo" : `Logo_${index + 1}`}
                    />
                ))}

            </header>
            {/* ---------- КОНТЕЙНЕР ФОРМЫ ---------- */}
            <section className="Registration">

                {/* ---------- HEADING ---------- */}
                <h2 className="Registration-heading">
                    KING PROMOTION
                    {/* Логотип в заголовке */}
                </h2>

                {/* ---------- КОНТЕНТ ФОРМЫ ---------- */}

                <section className="Registration-content">

                    {/* ---------- LOGIN FORM ---------- */}

                    {mode === 'login' ? (
                        <LoginForm
                            email={email}
                            password={password}

                            setEmail={setEmail}
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