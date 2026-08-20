// ------ Импорт API функции авторизации ------ //
import { loginUser } from './authApi'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import showIcon from '../../../../../assets/icons/show.png'
import dontShowIcon from '../../../../../assets/icons/dont_show.png'
import accountIcon from '../../../../../assets/icons/accaunt.png'

const rememberedLoginKey = 'king_remembered_login'

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
    const [rememberMe, setRememberMe] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')
    const navigate = useNavigate()

    useEffect(() => {
        const rememberedLogin = localStorage.getItem(rememberedLoginKey)

        if (rememberedLogin) {
            setLogin(rememberedLogin)
            setRememberMe(true)
        }
    }, [setLogin])

    // ------ Функция авторизации ------ //
    async function handleLogin(event) {
        event?.preventDefault()

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
                if (rememberMe) {
                    localStorage.setItem(rememberedLoginKey, normalizedLogin)
                } else {
                    localStorage.removeItem(rememberedLoginKey)
                }

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
        <form
            className="login-form"
            autoComplete="on"
            onSubmit={handleLogin}
        >

            {/* ------ INPUT ЛОГИНА ------ */}

            <div className="login-field">
                <label htmlFor="auth-login">
                    E-mail
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">
                        <img src={accountIcon} alt="" />
                    </span>

                    <input
                        id="auth-login"
                        name="email"
                        className="Username-input"
                        type="email"
                        autoComplete="username"
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
                    <button
                        type="button"
                        className="input-icon password-eye password-eye--inline"
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        <img
                            src={showPassword ? dontShowIcon : showIcon}
                            alt=""
                            aria-hidden="true"
                        />
                    </button>

                    <input
                        id="auth-password"
                        name="password"
                        className="Password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Введите пароль"
                        value={password}

                        onChange={(event) => {

                            // ------ Изменяем состояние password ------ //
                            setPassword(event.target.value)
                        }}
                    />

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
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
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
                    type="submit"
                    disabled={isSubmitting}
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
        </form>
    )
}
