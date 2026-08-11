// ------ Импорт API функции авторизации ------ //
import { loginUser } from './authApi'
import { useState } from 'react'

/// ------ Компонент формы авторизации ------ ///
export default function LoginForm({

    // ------ Данные пользователя ------ //
    login,
    password,

    // ------ Функции изменения состояний ------ //
    setLogin,
    setPassword,

    // ------ Глобальное состояние авторизации ------ //
    setIsAuth,

    // ------ Изменение режима login/register ------ //
    setMode

}) {
    const [showPassword, setShowPassword] = useState(false)

    // ------ Функция авторизации ------ //
    async function handleLogin() {

        try {

            // ------ POST запрос на backend сервер для авторизации ------ //
            // ------ Form JSON: { login, password } ------ //
            const response = await loginUser(
                login,
                password
            )

            // ------ Если сервер вернул успешную авторизацию ------ //
            if (response.ok) {

                // ------ Изменяем глобальное состояние авторизации ------ //
                setIsAuth(true)
            }

        } catch (error) {

            // ------ Логирование серверной ошибки ------ //
            console.log('Ошибка сервера:', error)
        }
    }

    return (
        <>

            {/* ------ INPUT ЛОГИНА ------ */}

            <div className="login-field">
                <label htmlFor="auth-login">
                    E-mail или телефон
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">@</span>

                    <input
                        id="auth-login"
                        className="Username-input"
                        type="text"
                        placeholder="Введите e-mail или телефон"
                        value={login}

                        onChange={(event) => {

                            // ------ Изменяем состояние login ------ //
                            setLogin(event.target.value)
                        }}
                    />
                </div>
            </div>

            {/* ------ INPUT ПАРОЛЯ ------ */}

            <div className="login-field">
                <div className="password-label">
                    <label htmlFor="auth-password">
                        Пароль
                    </label>

                    <button
                        type="button"
                        className="forgot-password"
                    >
                        Забыли пароль?
                    </button>
                </div>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">•</span>

                    <input
                        id="auth-password"
                        className="Password-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Введите пароль"
                        value={password}

                        onChange={(event) => {

                            // ------ Изменяем состояние password ------ //
                            setPassword(event.target.value)
                        }}
                    />

                    <button
                        type="button"
                        className="password-eye"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? 'Скрыть' : 'Показать'}
                    </button>
                </div>
            </div>

            <label className="remember-me">
                <input
                    type="checkbox"
                    defaultChecked
                />

                <span className="custom-checkbox">
                    ✓
                </span>

                <span>
                    Запомнить меня
                </span>
            </label>

            {/* ------ КОНТЕЙНЕР КНОПОК ------ */}

            <section className="Buttons-container">

                {/* ------ КНОПКА АВТОРИЗАЦИИ ------ */}

                <button
                    className="Login-button login-submit"
                    type="button"

                    onClick={handleLogin}
                >
                    <span>Войти</span>
                    <span className="login-arrow">→</span>
                </button>

            </section>

            <div className="login-divider">
                <span></span>
                <p>Или войдите через</p>
                <span></span>
            </div>

            <div className="login-socials">
                <button type="button" aria-label="Войти через Google">G</button>
                <button type="button" aria-label="Войти через VK">VK</button>
                <button type="button" aria-label="Войти через Telegram">TG</button>
                <button type="button" aria-label="Войти по QR-коду">QR</button>
            </div>

            <div className="login-register">
                <span>
                    Нет аккаунта?
                </span>

                <button
                    type="button"
                    onClick={() => {

                        // ------ Переключение режима на register ------ //
                        setMode('register')
                    }}
                >
                    Зарегистрироваться
                </button>
            </div>
        </>
    )
}
