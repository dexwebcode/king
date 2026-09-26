// ------ Импорт API функции авторизации ------ //
import {
    createTelegramGuestSession,
    getTelegramGuestStatus,
    loginUser,
    loginWithVk
} from './authApi'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as VKID from '@vkid/sdk'
import showIcon from '../../../../../assets/icons/show.svg'
import dontShowIcon from '../../../../../assets/icons/dont_show.svg'
import accountIcon from '../../../../../assets/icons/accaunt.svg'
import telegramIcon from '../../../../../assets/social_icons/telegram.svg'
import vkIcon from '../../../../../assets/social_icons/vk.svg'
import { hasPendingCheckoutDraft } from '../../../../../ui/orderDraft'
import { useLanguage } from '../../../../../ui/i18n'

const rememberedLoginKey = 'king_remembered_login'
const VK_APP_ID = 54737931
const VK_REDIRECT_URL = 'https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback'
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
    showModeSwitch = true,
    expandedSocialButtons = false,
    onAuthSuccess,
    onModeChange

}) {
    const { t } = useLanguage()
    const [showPassword, setShowPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [telegramToken, setTelegramToken] = useState('')
    const [telegramState, setTelegramState] = useState('idle')
    const [vkState, setVkState] = useState('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const navigate = useNavigate()
    /* Вкладка с Telegram: закрываем её, когда в боте нажали Start. */
    const telegramWindowRef = useRef(null)

    const continueAfterAuth = useCallback(async ({ replace = false } = {}) => {
        if (onAuthSuccess) {
            await onAuthSuccess()
            return
        }

        if (hasPendingCheckoutDraft()) {
            navigate('/main', { replace, state: { section: 'create', resumeCheckout: true } })
            return
        }

        navigate('/catalog', { replace })
    }, [navigate, onAuthSuccess])

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
                /* Start в боте нажат — вкладку с Telegram закрываем. */
                try {
                    telegramWindowRef.current?.close()
                } catch {
                    // Вкладку мог закрыть сам браузер — это не ошибка.
                }
                telegramWindowRef.current = null
                await continueAfterAuth({ replace: true })
                return
            }

            if (['expired', 'not_found', 'consumed'].includes(response.data.status)) {
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
    }, [continueAfterAuth, telegramToken])

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
                await continueAfterAuth()
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
        telegramWindowRef.current = telegramWindow

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
                const fallbackWindow = window.open(response.data.bot_url, '_blank')
                if (fallbackWindow) fallbackWindow.opener = null
                telegramWindowRef.current = fallbackWindow
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
                authPayload.device_id,
            )

            const response = await loginWithVk(tokenPayload.access_token)

            if (!response.ok || !response.data?.success) {
                setErrorMessage(response.data?.detail || 'Не удалось войти через VK ID')
                setVkState('idle')
                return
            }

            await continueAfterAuth({ replace: true })

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
                    {t('Логин или почта')}
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
                        placeholder={t('Введите логин или почту')}
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
                        {t('Пароль')}
                    </label>

                    <button
                        type="button"
                        className="forgot-password"
                    >
                        {t('Забыли пароль?')}
                    </button>
                </div>

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
                        id="auth-password"
                        name="password"
                        className="Password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder={t('Введите пароль')}
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
                    {t(errorMessage)}
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
                    {t('Запомнить меня')}
                </span>
            </label>

            {/* ------ КОНТЕЙНЕР КНОПОК ------ */}

            <section className={`Buttons-container ${expandedSocialButtons ? 'Buttons-container--expanded' : ''}`}>

                {/* ------ КНОПКА АВТОРИЗАЦИИ ------ */}

                <button
                    className="Login-button login-submit"
                    type="submit"
                    disabled={isSubmitting}
                >
                    <span>{isSubmitting ? t('Входим...') : t('Войти')}</span>
                </button>

                <button
                    className="social-login-square social-login-square--telegram"
                    type="button"
                    aria-label={t('Войти через Telegram')}
                    onClick={handleTelegramClick}
                    disabled={telegramState === 'loading'}
                >
                    <img src={telegramIcon} alt="" aria-hidden="true" />
                    <span className="social-login-label">{t('Войти через Telegram')}</span>
                </button>

                <button
                    className="social-login-square social-login-square--vk"
                    type="button"
                    aria-label={t('Войти через ВКонтакте')}
                    onClick={handleVkClick}
                    disabled={vkState === 'loading'}
                >
                    <img src={vkIcon} alt="" aria-hidden="true" />
                    <span className="social-login-label">{t('Войти через VK')}</span>
                </button>

            </section>

            {showModeSwitch && (
                <div className="login-register">
                    <span>
                        {t('Нет аккаунта?')}
                    </span>

                    <button type="button" className="auth-mode-link" onClick={onModeChange}>
                        {t('Зарегистрируйтесь')}
                    </button>
                </div>
            )}
        </form>
    )
}
