export function validatePassword(value) {
    const missing = []

    if (value.length === 0) {
        return ''
    }

    if (value.length < 6) {
        return 'Минимум 6 символов'
    }

    if (value.length > 20) {
        return 'Максимум 20 символов'
    }

    if (value.includes(' ')) {
        return 'Без пробелов'
    }

    if (!/[A-Z]/.test(value)) {
        missing.push('заглавную букву')
    }

    if (!/[a-z]/.test(value)) {
        missing.push('строчную букву')
    }

    if (!/[0-9]/.test(value)) {
        missing.push('цифру')
    }

    if (missing.length > 0) {
        return 'Добавьте: ' + missing.join(', ')
    }

    return 'Пароль подходит'
}