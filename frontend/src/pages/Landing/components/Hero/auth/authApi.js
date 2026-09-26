import { clearAccountCache } from '../../../../../ui/dataCache';

const API_URL = import.meta.env.VITE_API_URL || '';
const AUTH_CHANGED_EVENT = 'king-auth-changed';

export async function sendRequest(endpoint, method = 'GET', body = null, useAuth = true, options = {}) {

    const token = localStorage.getItem("token")
    const headers = {
        'Content-Type': 'application/json'
    }

    if (useAuth && token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        signal: options.signal,
        body: body ? JSON.stringify(body) : null
    })

    if (useAuth && response.status === 401 && token === localStorage.getItem('token')) {
        logoutUser()
    }

    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
        ? await response.json()
        : null

    return {
        ok: response.ok,
        status: response.status,
        data
    }
}

export async function loginUser(identifier, password) {

    const result = await sendRequest('/auth/login', 'POST', {
        identifier,
        password
    }, false)

    if (result.ok && result.data?.token) {

        localStorage.setItem("token", result.data.token)
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
    }

    return result
}

function saveAuthResult(result) {
    if (result.ok && result.data?.token) {
        localStorage.setItem("token", result.data.token)
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
    }

    return result
}

export async function registerUser(login, email, password) {
    const result = await sendRequest('/auth/register', 'POST', {
        login,
        email,
        password
    }, false)

    return saveAuthResult(result)
}

export function createTelegramGuestSession() {
    return sendRequest('/auth/telegram/guest/session', 'POST', null, false)
}

export function getTelegramGuestStatus(token) {
    return sendRequest(
        `/auth/telegram/guest/status?token=${encodeURIComponent(token)}`,
        'GET',
        null,
        false
    )
}

export async function loginWithVk(accessToken) {
    const result = await sendRequest('/auth/vk/login', 'POST', {
        access_token: accessToken,
    }, false)

    return saveAuthResult(result)
}

// Привязка Telegram к уже авторизованному аккаунту (CONNECT).
export function createTelegramSession() {
    return sendRequest('/auth/telegram/session', 'POST', null, true)
}

export function getTelegramSessionStatus(token) {
    return sendRequest(
        `/auth/telegram/session/status?token=${encodeURIComponent(token)}`,
        'GET',
        null,
        true
    )
}

// Привязка VK ID к уже авторизованному аккаунту (CONNECT).
export function connectVk(accessToken) {
    return sendRequest('/auth/vk/connect', 'POST', {
        access_token: accessToken,
    }, true)
}

export function checkToken() {
    return sendRequest('/auth/me', 'GET')
}

export async function logoutUser() {
    const token = localStorage.getItem("token")
    if (token) {
        try {
            // Серверная инвалидация сессии (token_version++). Best-effort:
            // при сетевой ошибке локальный выход всё равно выполняется.
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            })
        } catch (error) {
            // ignore — локальная сессия будет очищена ниже
        }
    }
    localStorage.removeItem("token")
    clearAccountCache()
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export { AUTH_CHANGED_EVENT }

export async function isAuth() {

    const token = localStorage.getItem("token")

    // Token отсутствует
    if (!token) {
        return false
    }

    // A temporary outage must not erase a session or prevent public pages from rendering.
    try {
        const result = await checkToken()
        return result.ok
    } catch {
        // Сетевая ошибка ≠ выход из аккаунта: сессия не признаётся недействительной.
        return null
    }
}
