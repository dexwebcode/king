// ------ Импорт стилей компонента Auth ------ //
import './Auth.css'

// ------ Импорт React hooks ------ //
import { useEffect, useState } from 'react'

// ------ Импорт компонентов форм ------ //
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'

import logo from "../../assets/logo.png"
import phone from "../../assets/phone.png"
import instagram from "../../assets/insta.png"
import youtube from "../../assets/youtube.png"
import tiktok from "../../assets/tiktok.png"
import vk from "../../assets/vk.png"
import x from "../../assets/x.png"
import telegram from "../../assets/telegram.png"
import { Link } from "react-router-dom"
/// ------ Главный компонент авторизации ------ ///
export default function Auth({ setIsAuth = () => { }, initialMode = 'login' }) {

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

        <main className="login-page">

            <section className="login-left">

                <div className="login-left-copy">
                    <h1>
                        Добро пожаловать
                        <br />
                        в <span>KING PROMOTION</span>
                    </h1>

                    <p>
                        Войдите в свой аккаунт и управляйте продвижением
                        <br />
                        в социальных сетях легко и эффективно.
                    </p>
                </div>


                <div className="login-features">
                    <div className="login-feature">
                        <span className="feature-icon">✓</span>
                        <strong>Безопасно</strong>
                        <span>100% гарантия</span>
                    </div>

                    <div className="login-feature">
                        <span className="feature-icon">⚡</span>
                        <strong>Быстрый вход</strong>
                        <span>за секунды</span>
                    </div>

                    <div className="login-feature">
                        <span className="feature-icon">?</span>
                        <strong>Поддержка</strong>
                        <span>24/7</span>
                    </div>

                    <div className="login-feature">
                        <span className="feature-icon">↗</span>
                        <strong>Реальные</strong>
                        <span>результаты</span>
                    </div>
                </div>

            </section>

            <section className="login-right">
                <div className="login-card">
                    <div className="login-card-header">
                        <h2>
                            {mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
                        </h2>

                        <p>
                            {mode === 'login'
                                ? 'Введите свои данные для входа'
                                : 'Создайте аккаунт для начала работы'}
                        </p>
                    </div>

                    <section className="Registration-content">
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
                </div>
            </section>

            <footer className="login-footer">
                © 2026 KING PROMOTION. Все права защищены.
            </footer>

        </main>
    )
}
