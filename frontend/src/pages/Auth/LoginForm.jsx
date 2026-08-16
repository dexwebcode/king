// ------ Импорт API функции авторизации ------ //
import { loginUser } from './authApi'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const navigate = useNavigate()

    // ------ Функция авторизации ------ //
    async function handleLogin() {
        const normalizedLogin = login.trim().toLowerCase()

        if (!normalizedLogin || !password) {
            setErrorMessage('Введите логин и пароль')
            return
        }

        setIsSubmitting(true)
        setErrorMessage('')

        try {

            // ------ POST запрос на backend сервер для авторизации ------ //
            const response = await loginUser(
                normalizedLogin,
                password
            )

            // ------ Если сервер вернул успешную авторизацию ------ //
            if (response.ok) {

                // ------ Изменяем глобальное состояние авторизации ------ //
                setIsAuth(true)
                navigate('/main')
                return
            }

            setErrorMessage(
                response.data?.detail || 'Неверный логин или пароль'
            )

        } catch (error) {

            // ------ Логирование серверной ошибки ------ //
            console.log('Ошибка сервера:', error)
            setErrorMessage('Не удалось подключиться к серверу')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <>

            {/* ------ INPUT ЛОГИНА ------ */}

            <div className="login-field">
                <label htmlFor="auth-login">
                    E-mail
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">@</span>

                    <input
                        id="auth-login"
                        className="Username-input"
                        type="email"
                        placeholder="Введите e-mail"
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

            {errorMessage && (
                <p className="Password-hint auth-message auth-message--error">
                    {errorMessage}
                </p>
            )}

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
                    disabled={isSubmitting}
                    onClick={handleLogin}
                >
                    <span>{isSubmitting ? 'Входим...' : 'Войти'}</span>
                    <span className="login-arrow">→</span>
                </button>

            </section>

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
