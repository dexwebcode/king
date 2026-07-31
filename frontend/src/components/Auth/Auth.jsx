// ------ Импорт стилей компонента Auth ------ //
import './Auth.css'

// ------ Импорт React hooks ------ //
import { useEffect, useState } from 'react'

// ------ Импорт компонентов форм ------ //
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'
import logo from "../../assets/logo.png"
import logo_2 from "../../assets/logo.png"
import logo_3 from "../../assets/logo.png"
import logo_4 from "../../assets/logo.png"
import logo_5 from "../../assets/logo.png"
import logo_6 from "../../assets/logo.png"
import logo_7 from "../../assets/logo.png"

/// ------ Главный компонент авторизации ------ ///
export default function Auth({ setIsAuth }) {

    // ------ Режим формы: login/register ------ //
    const [mode, setMode] = useState('login')

    // ------ Режим меню ------ //
    const [menuMode, setMenuMode] = useState(false)

    const [panel, setPanel] = useState(null);

    // ------ Состояния данных пользователя ------ //
    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')

    // ------ Состояние повтора пароля ------ //
    const [repeatPassword, setRepeatPassword] = useState('')

    // ------ Состояние подсказки проверки пароля ------ //
    const [passwordHint, setPasswordHint] = useState('')

    // ------ Функция очистки всех полей формы ------ //
    function clearFields() {
        setLogin('')
        setPassword('')
        setRepeatPassword('')
        setPasswordHint('')
    }

    // ------ Эффект очистки полей при смене режима ------ //
    useEffect(() => {
        clearFields()

    }, [mode])

    return (

        <section className="Auth">
            <header className="Auth-header">

                <img
                    src={logo}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo"
                />
                <img
                    src={logo_2}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_2"
                />
                <img
                    src={logo_3}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_3"
                />
                <img
                    src={logo_4}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_4"
                />
                <img
                    src={logo_5}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_5"
                />
                <img
                    src={logo_6}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_6"
                />
                <img
                    src={logo_7}
                    onClick={() => setMenuMode(!menuMode)}
                    alt="Logo"
                    className="Logo_7"
                />
                {menuMode && (
                    <>
                        <div className="Info-panel">
                            Здесь информация о платформе AIONIQ.
                        </div>
                    </>
                )}
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

                            // ------ Данные пользователя ------ //
                            login={login}
                            password={password}

                            // ------ Функции изменения состояний ------ //
                            setLogin={setLogin}
                            setPassword={setPassword}

                            // ------ Глобальная авторизация ------ //
                            setIsAuth={setIsAuth}

                            // ------ Изменение режима ------ //
                            setMode={setMode}
                        />

                    ) : (

                        /* ---------- REGISTER FORM ---------- */

                        <RegisterForm

                            // ------ Данные пользователя ------ //
                            login={login}
                            password={password}
                            repeatPassword={repeatPassword}
                            // ------ Подсказка проверки пароля ------ //
                            passwordHint={passwordHint}
                            // ------ Функции изменения состояний ------ //
                            setLogin={setLogin}
                            setPassword={setPassword}
                            setRepeatPassword={setRepeatPassword}
                            setPasswordHint={setPasswordHint}

                            // ------ Глобальная авторизация ------ //
                            setIsAuth={setIsAuth}

                            // ------ Изменение режима ------ //
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