// ------ Импорт API функции авторизации ------ //
import {
    createTelegramGuestSession,
    getTelegramGuestStatus,
    loginUser,
    loginWithVk
} from './authApi'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import showIcon from '../../../../../assets/icons/show.png'
import dontShowIcon from '../../../../../assets/icons/dont_show.png'
import accountIcon from '../../../../../assets/icons/accaunt.png'
import telegramIcon from '../../../../../assets/social_icons/telegram.svg'
import vkIcon from '../../../../../assets/social_icons/vk.svg'
import SocialAuthPrompt from './SocialAuthPrompt'

const rememberedLoginKey = 'king_remembered_login'
const VK_APP_ID = 54737931
const VK_REDIRECT_URL = 'https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback'
const VK_SDK_URL = 'https://unpkg.com/@vkid/sdk@<3.0.0/dist-sdk/umd/index.js'

function loadVkSdk() {
    if (window.VKIDSDK) {
        return Promise.resolve(window.VKIDSDK)
    }

    return new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${VK_SDK_URL}"]`)

        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.VKIDSDK), { once: true })
            existingScript.addEventListener('error', reject, { once: true })
            return
        }

        const script = document.createElement('script')
        script.src = VK_SDK_URL
        script.async = true
        script.onload = () => resolve(window.VKIDSDK)
        script.onerror = reject
        document.head.appendChild(script)
    })
}

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
    setMode,
    showModeSwitch = true,
    showSocialAuth = true

}) {
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [telegramToken, setTelegramToken] = useState('')
    const [telegramState, setTelegramState] = useState('idle')
    const [vkState, setVkState] = useState('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const navigate = useNavigate()

    useEffect(() => {
        const rememberedLogin = localStorage.getItem(rememberedLoginKey)

        if (rememberedLogin) {
            setLogin(rememberedLogin)
            setRememberMe(true)
        }
    }, [setLogin])

    useEffect(() => {
        if (!telegramToken) {
            return undefined
        }

        let isMounted = true

        async function checkTelegramStatus() {
            const response = await getTelegramGuestStatus(telegramToken)

            if (!isMounted) {
                return
            }

            if (!response.ok || !response.data?.success) {
                setErrorMessage(response.data?.detail || 'Не удалось проверить Telegram')
                return
            }

            if (response.data.action === 'login' && response.data.token) {
                localStorage.setItem('token', response.data.token)
                window.dispatchEvent(new Event('king-auth-changed'))
                navigate('/catalog', { replace: true })
                return
            }

            if (response.data.action === 'complete_account') {
                setTelegramToken('')
                navigate('/telegram-auth', {
                    replace: true,
                    state: {
                        token: telegramToken,
                        telegram: response.data.telegram,
                        suggestedLogin: response.data.suggested_login,
                    },
                })
                return
            }

            if (response.data.status === 'expired' || response.data.status === 'not_found') {
                setTelegramToken('')
                setTelegramState('idle')
                setErrorMessage(response.data.message || 'Telegram-сессия истекла')
                return
            }

            setTelegramState('pending')
            setErrorMessage('Подтвердите вход в Telegram-боте')
        }

        checkTelegramStatus()
        const intervalId = window.setInterval(checkTelegramStatus, 2500)

        return () => {
            isMounted = false
            window.clearInterval(intervalId)
        }
    }, [navigate, telegramToken])

    // ------ Функция авторизации ------ //
    async function handleLogin(event) {
        event?.preventDefault()

        const identifier = login.trim().toLowerCase()

        if (!identifier || !password) {
            setErrorMessage('Введите логин и пароль')
            return
        }

        setIsSubmitting(true)
        setErrorMessage('')

        try {

            // ------ POST запрос на backend сервер для авторизации ------ //
            const response = await loginUser(
                identifier,
                password
            )

            // ------ Если сервер вернул успешную авторизацию ------ //
            if (response.ok) {
                if (rememberMe) {
                    localStorage.setItem(rememberedLoginKey, identifier)
                } else {
                    localStorage.removeItem(rememberedLoginKey)
                }

                // ------ Изменяем глобальное состояние авторизации ------ //
                setIsAuth(true)
                navigate('/catalog')
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

    async function handleTelegramClick() {
        const telegramWindow = window.open('about:blank', '_blank')

        try {
            setTelegramState('loading')
            setErrorMessage('')

            const response = await createTelegramGuestSession()

            if (!response.ok || !response.data?.success) {
                telegramWindow?.close()
                setTelegramState('idle')
                setErrorMessage(response.data?.detail || 'Не удалось создать Telegram-сессию')
                return
            }

            if (!response.data.bot_url || !response.data.token) {
                telegramWindow?.close()
                setTelegramState('idle')
                setErrorMessage('Telegram-бот не настроен на backend')
                return
            }

            setTelegramToken(response.data.token)
            setTelegramState('pending')
            setErrorMessage('Откройте Telegram и нажмите Start')

            if (telegramWindow) {
                telegramWindow.opener = null
                telegramWindow.location.href = response.data.bot_url
            } else {
                window.open(response.data.bot_url, '_blank', 'noopener,noreferrer')
            }

        } catch (error) {
            telegramWindow?.close()
            console.log('Ошибка Telegram авторизации:', error)
            setTelegramState('idle')
            setErrorMessage('Не удалось подключиться к серверу')
        }
    }

    async function handleVkClick() {
        try {
            setVkState('loading')
            setErrorMessage('')

            const VKID = await loadVkSdk()

            if (!VKID) {
                setErrorMessage('Не удалось загрузить VK ID')
                setVkState('idle')
                return
            }

            VKID.Config.init({
                app: VK_APP_ID,
                redirectUrl: VK_REDIRECT_URL,
                responseMode: VKID.ConfigResponseMode.Callback,
                mode: VKID.ConfigAuthMode.InNewWindow,
                source: VKID.ConfigSource.LOWCODE,
                scope: 'email',
            })

            const authPayload = await VKID.Auth.login()
            const tokenPayload = await VKID.Auth.exchangeCode(
                authPayload.code,
                authPayload.device_id
            )

            const response = await loginWithVk(tokenPayload.access_token)

            if (!response.ok || !response.data?.success) {
                setErrorMessage(response.data?.detail || 'Не удалось войти через VK ID')
                setVkState('idle')
                return
            }

            navigate('/catalog', { replace: true })

        } catch (error) {
            console.log('Ошибка VK ID авторизации:', error)
            setErrorMessage(error?.error_description || error?.error || 'VK ID вход не завершен')
            setVkState('idle')
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
                    Логин
                </label>

                <div className="login-input-wrapper">
                    <span className="input-icon" aria-hidden="true">
                        <img src={accountIcon} alt="" />
                    </span>

                    <input
                        id="auth-login"
                        name="identifier"
                        className="Username-input"
                        type="text"
                        autoComplete="username"
                        placeholder="Введите логин или почту"
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
                </button>

                <button
                    className="social-login-square social-login-square--telegram"
                    type="button"
                    aria-label="Войти через Telegram"
                    onClick={handleTelegramClick}
                    disabled={telegramState === 'loading'}
                >
                    <img src={telegramIcon} alt="" aria-hidden="true" />
                </button>

                <button
                    className="social-login-square social-login-square--vk"
                    type="button"
                    aria-label="Войти через ВКонтакте"
                    onClick={handleVkClick}
                    disabled={vkState === 'loading'}
                >
                    <img src={vkIcon} alt="" aria-hidden="true" />
                </button>

            </section>

            <p className="login-social-note">
                При входе через сторонние сервисы мы создаем аккаунт
                за вас автоматически
            </p>

            {showModeSwitch && (
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
            )}

            {showSocialAuth && (
                <SocialAuthPrompt />
            )}
        </form>
    )
}
