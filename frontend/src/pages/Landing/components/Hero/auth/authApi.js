const API_URL = import.meta.env.VITE_API_URL || '';
const AUTH_CHANGED_EVENT = 'king-auth-changed';

async function sendRequest(endpoint, method = 'GET', body = null, useAuth = true) {

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
        body: body ? JSON.stringify(body) : null
    })

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

export function checkToken() {
    return sendRequest('/auth/me', 'GET')
}

export function logoutUser() {
    localStorage.removeItem("token")
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export { AUTH_CHANGED_EVENT }

export async function isAuth() {

    const token = localStorage.getItem("token")

    // Token отсутствует
    if (!token) {
        return false
    }

    // Проверяем token через backend
    const result = await checkToken()

    // Token валиден
    if (result.ok) {
        return true
    }

    // Token невалиден
    localStorage.removeItem("token")

    return false
}
