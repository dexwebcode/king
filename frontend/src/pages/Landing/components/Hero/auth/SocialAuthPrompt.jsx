import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import telegramIcon from '../../../../../assets/social_icons/telegram-black.svg'
import vkIcon from "../../../../../assets/social_icons/vk.svg";
import {
    createTelegramGuestSession,
    getTelegramGuestStatus,
    loginWithVk
} from './authApi'

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

export default function SocialAuthPrompt({ onEmailClick, footerText = '' }) {
    const [telegramToken, setTelegramToken] = useState('')
    const [telegramState, setTelegramState] = useState('idle')
    const [vkState, setVkState] = useState('idle')
    const [message, setMessage] = useState('')
    const navigate = useNavigate()

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
                setMessage(response.data?.detail || 'Не удалось проверить Telegram')
                return
            }

            if (response.data.action === 'login' && response.data.token) {
                localStorage.setItem('token', response.data.token)
                window.dispatchEvent(new Event('king-auth-changed'))
                navigate('/main', { replace: true })
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
                setMessage(response.data.message || 'Telegram-сессия истекла')
                return
            }

            setTelegramState('pending')
            setMessage('Подтвердите вход в Telegram-боте')
        }

        checkTelegramStatus()
        const intervalId = window.setInterval(checkTelegramStatus, 2500)

        return () => {
            isMounted = false
            window.clearInterval(intervalId)
        }
    }, [navigate, telegramToken])

    async function handleTelegramClick() {
        const telegramWindow = window.open('about:blank', '_blank')

        try {
            setTelegramState('loading')
            setMessage('')

            const response = await createTelegramGuestSession()

            if (!response.ok || !response.data?.success) {
                telegramWindow?.close()
                setTelegramState('idle')
                setMessage(response.data?.detail || 'Не удалось создать Telegram-сессию')
                return
            }

            if (!response.data.bot_url || !response.data.token) {
                telegramWindow?.close()
                setTelegramState('idle')
                setMessage('Telegram-бот не настроен на backend')
                return
            }

            setTelegramToken(response.data.token)
            setTelegramState('pending')
            setMessage('Откройте Telegram и нажмите Start')

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
            setMessage('Не удалось подключиться к серверу')
        }
    }

    async function handleVkClick() {
        try {
            setVkState('loading')
            setMessage('')

            const VKID = await loadVkSdk()

            if (!VKID) {
                setMessage('Не удалось загрузить VK ID')
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
                setMessage(response.data?.detail || 'Не удалось войти через VK ID')
                setVkState('idle')
                return
            }

            navigate('/main', { replace: true })

        } catch (error) {
            console.log('Ошибка VK ID авторизации:', error)
            setMessage(error?.error_description || error?.error || 'VK ID вход не завершен')
            setVkState('idle')
        }
    }

    return (
        <div className="social-auth-prompt">
            <div className="social-auth-actions">
                <button
                    type="button"
                    className="social-auth-button social-auth-button--telegram"
                    onClick={handleTelegramClick}
                    disabled={telegramState === 'loading'}
                >
                    <img src={telegramIcon} alt="" aria-hidden="true" />
                    <span>
                        Telegram
                    </span>
                </button>

                <button
                    type="button"
                    className="social-auth-button social-auth-button--vk"
                    onClick={handleVkClick}
                    disabled={vkState === 'loading'}
                >
                    <img src={vkIcon} alt="" aria-hidden="true" />
                    <span>
                        {vkState === 'loading' ? 'Открываем VK ID' : 'ВКонтакте'}
                    </span>
                </button>

                <button
                    type="button"
                    className="social-auth-button social-auth-button--email"
                    onClick={onEmailClick}
                >
                    <span>
                        Email
                    </span>
                </button>
            </div>

            {message && (
                <p className="social-auth-message">
                    {message}
                </p>
            )}

            {footerText && (
                <p className="social-auth-footer">
                    {footerText}
                </p>
            )}
        </div>
    )
}
