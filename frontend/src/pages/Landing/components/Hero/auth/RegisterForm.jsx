// ------ Импорт API функции регистрации ------ //
import { registerUser } from './authApi'

// ------ Импорт функции проверки пароля ------ //
import { validatePassword } from './validatePassword'

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import showIcon from '../../../../../assets/icons/show.svg'
import dontShowIcon from '../../../../../assets/icons/dont_show.svg'
import accountIcon from '../../../../../assets/icons/accaunt.svg'
import { hasPendingCheckoutDraft } from '../../../../../ui/orderDraft'
import { useLanguage } from '../../../../../ui/i18n'

/// ------ Компонент формы регистрации ------ ///
export default function RegisterForm({

    // ------ Данные пользователя ------ //
    password,
    repeatPassword,

    // ------ Подсказки проверки ------ //
    passwordHint,

    // ------ Функции изменения состояний ------ //
    setPassword,
    setRepeatPassword,
    setPasswordHint,

    // ------ Глобальное состояние авторизации ------ //
    setIsAuth,

    // ------ Показывать переключатель на вход ------ //
    showModeSwitch = true,
    onAuthSuccess,
    onModeChange

}) {
    const { t } = useLanguage()
    const [showPassword, setShowPassword] = useState(false)
    const [showRepeatPassword, setShowRepeatPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [login, setLogin] = useState('')
    const [loginHint, setLoginHint] = useState('')
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

    // ------ Функция регистрации ------ //
    async function handleRegister() {

        // ------ Нормализуем логин ------ //
        const normalizedLogin = login.trim().toLowerCase()

        if (normalizedLogin.length < 3 || normalizedLogin.length > 40 || /\s/.test(normalizedLogin)) {
            setLoginHint('Логин: от 3 до 40 символов, без пробелов')
            return
        }
        setLoginHint('')

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

            // ------ Отправляем данные на backend (без почты) ------ //
            const response = await registerUser(
                normalizedLogin,
                null,
                password
            )

            // ------ Если регистрация завершилась ошибкой ------ //
            if (!response.ok) {
                const detail = response.data?.detail || 'Ошибка регистрации'
                setLoginHint(detail)

                return
            }

            // ------ Сохраняем JWT-токен ------ //
            localStorage.setItem(
                'token',
                response.data.token
            )

            // ------ Изменяем состояние авторизации ------ //
            setIsAuth(true)
            if (onAuthSuccess) {
                await onAuthSuccess()
            } else if (hasPendingCheckoutDraft()) {
                navigate('/main', { state: { section: 'create', resumeCheckout: true } })
            } else {
                navigate('/catalog')
            }

        } catch (error) {

            console.log('Ошибка сервера:', error)

            setLoginHint(
                'Не удалось подключиться к серверу'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <>

            <div className="login-field">
                <label htmlFor="register-login">{t('Логин')}</label>
                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">
                        <img src={accountIcon} alt="" />
                    </span>
                    <input
                        id="register-login"
                        name="username"
                        className="Username-input"
                        type="text"
                        autoComplete="username"
                        placeholder={t('Придумайте логин')}
                        value={login}
                        onChange={(event) => setLogin(event.target.value)}
                    />
                </div>
            </div>

            {loginHint && <p className="Password-hint">{t(loginHint)}</p>}

            {/* ------ INPUT ПАРОЛЯ ------ */}

            <div className="login-field">
                <label htmlFor="register-password">
                    {t('Пароль')}
                </label>

                <div className="login-input-wrapper">
                    <button
                        type="button"
                        className="input-icon password-eye password-eye--inline"
                        aria-label={showPassword ? t('Скрыть пароль') : t('Показать пароль')}
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        <img
                            src={showPassword ? dontShowIcon : showIcon}
                            alt=""
                            aria-hidden="true"
                        />
                    </button>

                    <input
                        id="register-password"
                        className="Password-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('Придумайте пароль')}
                        value={password}
                        onChange={handlePasswordChange}
                    />

                </div>
            </div>

            {/* ------ INPUT ПОВТОРА ПАРОЛЯ ------ */}

            <div className="login-field">
                <label htmlFor="register-repeat-password">
                    {t('Повторите пароль')}
                </label>

                <div className="login-input-wrapper">
                    <button
                        type="button"
                        className="input-icon password-eye password-eye--inline"
                        aria-label={showRepeatPassword ? t('Скрыть пароль') : t('Показать пароль')}
                        onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                    >
                        <img
                            src={showRepeatPassword ? dontShowIcon : showIcon}
                            alt=""
                            aria-hidden="true"
                        />
                    </button>

                    <input
                        id="register-repeat-password"
                        className="Password-input"
                        type={showRepeatPassword ? 'text' : 'password'}
                        placeholder={t('Повторите пароль')}
                        value={repeatPassword}
                        onChange={(event) => {

                            // ------ Изменяем состояние repeatPassword ------ //
                            setRepeatPassword(event.target.value)
                        }}
                    />

                </div>
            </div>

            {/* ------ ПОДСКАЗКА ПРОВЕРКИ ПАРОЛЯ ------ */}

            {passwordHint && (
                <p className="Password-hint">
                    {t(passwordHint)}
                </p>
            )}

            {/* ------ КОНТЕЙНЕР КНОПОК ------ */}

            <section className="Buttons-container register-actions">

                {/* ------ КНОПКА РЕГИСТРАЦИИ ------ */}

                <button
                    className="Login-button login-submit"
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleRegister}
                >
                    <span>{isSubmitting ? t('Создаем...') : t('Создать аккаунт')}</span>
                </button>

            </section>

            {showModeSwitch && (
                <div className="login-register">
                    <span>
                        {t('Уже есть аккаунт?')}
                    </span>

                    <button type="button" className="auth-mode-link" onClick={onModeChange}>
                        {t('Войти')}
                    </button>
                </div>
            )}

        </>
    )
}
