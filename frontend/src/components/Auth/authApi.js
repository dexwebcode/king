const API_URL = 'http://127.0.0.1:5000'

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

    const data = await response.json()
    console.log("Response from API:", { endpoint, method, body, response: data })
    
    return {
        ok: response.ok,
        status: response.status,
        data
    }
}

export async function loginUser(login, password) {

    const result = await sendRequest('/login', 'POST', {
        login,
        password
    })

    if (result.ok && result.data.token) {

        localStorage.setItem("token", result.data.token)

        console.log("TOKEN СОХРАНЕН")
    }

    return result
}

export function registerUser(login, password) {
    return sendRequest('/register', 'POST', {
        login,
        password
    })
}

export function checkToken() {
    return sendRequest('/me', 'GET')
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