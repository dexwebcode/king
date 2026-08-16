// ------ Импорт API функции регистрации ------ //
import { registerUser } from './authApi'

// ------ Импорт функции проверки пароля ------ //
import { validatePassword } from './validatePassword'

// ------ Импорт функции проверки почты ------ //
import { validateEmail } from './validateEmail'

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/// ------ Компонент формы регистрации ------ ///
export default function RegisterForm({

    // ------ Данные пользователя ------ //
    email,
    password,
    repeatPassword,

    // ------ Подсказки проверки ------ //
    passwordHint,
    emailHint,

    // ------ Функции изменения состояний ------ //
    setEmail,
    setPassword,
    setRepeatPassword,
    setPasswordHint,
    setEmailHint,

    // ------ Глобальное состояние авторизации ------ //
    setIsAuth,

    // ------ Изменение режима login/register ------ //
    setMode,

    // ------ Показывать переключатель на вход ------ //
    showModeSwitch = true

}) {
    const [showPassword, setShowPassword] = useState(false)
    const [showRepeatPassword, setShowRepeatPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const navigate = useNavigate()


    // ------ Функция изменения пароля + проверка безопасности ------ //
    function handlePasswordChange(event) {

        // ------ Получаем текущее значение input ------ //
        const value = event.target.value

        // ------ Обновляем состояние password ------ //
        setPassword(value)

        // ------ Проверяем пароль и меняем состояние passwordHint ------ //
        setPasswordHint(
            validatePassword(value)
        )
    }

    // ------ Функция изменения почты + проверка ------ //
    function handleEmailChange(event) {

        // ------ Получаем текущее значение input ------ //
        const value = event.target.value

        // ------ Обновляем состояние email ------ //
        setEmail(value)

        // ------ Проверяем почту и меняем состояние emailHint ------ //
        setEmailHint(
            validateEmail(value)
        )
    }

    // ------ Функция регистрации ------ //
    async function handleRegister() {

        // ------ Нормализуем почту ------ //
        const normalizedEmail = email.trim().toLowerCase()

        // ------ Проверяем корректность почты ------ //
        const emailError = validateEmail(normalizedEmail)

        if (emailError) {
            setEmailHint(emailError)
            return
        }

        // ------ Проверяем корректность пароля ------ //
        const passwordError = validatePassword(password)

        if (passwordError) {
            setPasswordHint(passwordError)
            return
        }

        // ------ Проверяем совпадение паролей ------ //
        if (password !== repeatPassword) {
            setPasswordHint('Пароли не совпадают')
            return
        }

        try {
            setIsSubmitting(true)

            // ------ Отправляем данные на backend ------ //
            const response = await registerUser(
                normalizedEmail,
                password
            )

            // ------ Если регистрация завершилась ошибкой ------ //
            if (!response.ok) {
                setEmailHint(
                    response.data?.detail || 'Ошибка регистрации'
                )

                return
            }

            // ------ Сохраняем JWT-токен ------ //
            localStorage.setItem(
                'token',
                response.data.token
            )

            // ------ Изменяем состояние авторизации ------ //
            setIsAuth(true)
            navigate('/main')

        } catch (error) {

            console.log('Ошибка сервера:', error)

            setEmailHint(
                'Не удалось подключиться к серверу'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <>

            {/* ------ INPUT ПОЧТЫ ------ */}

            <div className="login-field">
                <label htmlFor="register-email">
                    E-mail
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">@</span>

                    <input
                        id="register-email"
                        className="Username-input"
                        type="email"
                        placeholder="Введите почту"
                        value={email}
                        onChange={handleEmailChange}
                    />
                </div>
            </div>

            {/* ------ ПОДСКАЗКА ПРОВЕРКИ ПОЧТЫ ------ */}

            {emailHint && (
                <p className="Password-hint">
                    {emailHint}
                </p>
            )}

            {/* ------ INPUT ПАРОЛЯ ------ */}

            <div className="login-field">
                <label htmlFor="register-password">
                    Пароль
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">•</span>

                    <input
                        id="register-password"
                        className="Password-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Придумайте пароль"
                        value={password}
                        onChange={handlePasswordChange}
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

            {/* ------ INPUT ПОВТОРА ПАРОЛЯ ------ */}

            <div className="login-field">
                <label htmlFor="register-repeat-password">
                    Повторите пароль
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">•</span>

                    <input
                        id="register-repeat-password"
                        className="Password-input"
                        type={showRepeatPassword ? 'text' : 'password'}
                        placeholder="Повторите пароль"
                        value={repeatPassword}
                        onChange={(event) => {

                            // ------ Изменяем состояние repeatPassword ------ //
                            setRepeatPassword(event.target.value)
                        }}
                    />

                    <button
                        type="button"
                        className="password-eye"
                        aria-label={showRepeatPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                    >
                        {showRepeatPassword ? 'Скрыть' : 'Показать'}
                    </button>
                </div>
            </div>

            {/* ------ ПОДСКАЗКА ПРОВЕРКИ ПАРОЛЯ ------ */}

            {passwordHint && (
                <p className="Password-hint">
                    {passwordHint}
                </p>
            )}

            {/* ------ КОНТЕЙНЕР КНОПОК ------ */}

            <section className="Buttons-container">

                {/* ------ КНОПКА РЕГИСТРАЦИИ ------ */}

                <button
                    className="Login-button login-submit"
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleRegister}
                >
                    <span>{isSubmitting ? 'Создаем...' : 'Создать аккаунт'}</span>
                    <span className="login-arrow">→</span>
                </button>

            </section>

            {showModeSwitch && (
                <div className="login-register">
                    <span>
                        Уже есть аккаунт?
                    </span>

                    <button
                        type="button"
                        onClick={() => {

                            // ------ Переключение режима на login ------ //
                            setMode('login')
                        }}
                    >
                        Войти
                    </button>
                </div>
            )}

        </>
    )
}
