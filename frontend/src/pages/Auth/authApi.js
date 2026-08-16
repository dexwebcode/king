const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function sendRequest(endpoint, method = 'GET', body = null) {

    const token = localStorage.getItem("token")
    const headers = {
        'Content-Type': 'application/json'
    }

    if (token) {
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

export async function loginUser(email, password) {

    const result = await sendRequest('/auth/login', 'POST', {
        email,
        password
    })

    if (result.ok && result.data.token) {

        localStorage.setItem("token", result.data.token)
    }

    return result
}

export function registerUser(email, password) {
    return sendRequest('/auth/register', 'POST', {
        email,
        password
    })
}

export function checkToken() {
    return sendRequest('/auth/me', 'GET')
}

export function logoutUser() {
    localStorage.removeItem("token")
}

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
