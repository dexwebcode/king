// ------ Импорт API функции регистрации ------ //
import { registerUser } from './authApi'

// ------ Импорт функции проверки пароля ------ //
import { validatePassword } from './validatePassword'

// ------ Импорт функции проверки почты ------ //
import { validateEmail } from './validateEmail'

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
    setMode

}) {

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

    } catch (error) {

        console.log('Ошибка сервера:', error)

        setEmailHint(
            'Не удалось подключиться к серверу'
        )
    }
}

    return (
        <>

            {/* ------ INPUT ПОЧТЫ ------ */}

            <input
                className="Username-input"
                type="email"
                placeholder="Введите почту"
                value={email}
                onChange={handleEmailChange}
            />

            {/* ------ ПОДСКАЗКА ПРОВЕРКИ ПОЧТЫ ------ */}

            {emailHint && (
                <p className="Password-hint">
                    {emailHint}
                </p>
            )}

            {/* ------ INPUT ПАРОЛЯ ------ */}

            <input
                className="Password-input"
                type="password"
                placeholder="Придумайте пароль"
                value={password}
                onChange={handlePasswordChange}
            />

            {/* ------ INPUT ПОВТОРА ПАРОЛЯ ------ */}

            <input
                className="Password-input"
                type="password"
                placeholder="Повторите пароль"
                value={repeatPassword}
                onChange={(event) => {

                    // ------ Изменяем состояние repeatPassword ------ //
                    setRepeatPassword(event.target.value)
                }}
            />

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
                    className="Login-button"
                    type="button"
                    onClick={handleRegister}
                >
                    Создать аккаунт
                </button>

                {/* ------ КНОПКА ВОЗВРАТА В LOGIN ------ */}

                <button
                    className="Register-button"
                    type="button"
                    onClick={() => {

                        // ------ Переключение режима на login ------ //
                        setMode('login')
                    }}
                >
                    Назад
                </button>

            </section>

        </>
    )
}
