// ------ Импорт API функции регистрации ------ //
import { registerUser } from './authApi'

// ------ Импорт функции проверки пароля ------ //
import { validatePassword } from './validatePassword'

/// ------ Компонент формы регистрации ------ ///
export default function RegisterForm({

    // ------ Данные пользователя ------ //
    login,
    password,
    repeatPassword,

    // ------ Подсказка проверки пароля ------ //
    passwordHint,

    // ------ Функции изменения состояний ------ //
    setLogin,
    setPassword,
    setRepeatPassword,
    setPasswordHint,

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

    // ------ Функция регистрации ------ //
    async function handleRegister() {

        // ------ Проверка совпадения паролей ------ //
        if (password !== repeatPassword) {

            // ------ Меняем состояние подсказки ошибки ------ //
            setPasswordHint('Пароли не совпадают')

            // ------ Останавливаем выполнение функции ------ //
            return
        }

        try {

            // ------ POST запрос на backend сервер для регистрации ------ //
            // ------ Form JSON: { login, password } ------ //
            const response = await registerUser(
                login,
                password
            )

            // ------ Если сервер вернул успешную регистрацию ------ //
            if (response.ok) {

                // ------ Изменяем глобальное состояние авторизации ------ //
                setIsAuth(true)
            }

        } catch (error) {

            // ------ Логирование серверной ошибки ------ //
            console.log('Ошибка сервера:', error)
        }
    }

    return (
        <>

            {/* ------ INPUT ЛОГИНА ------ */}

            <input
                className="Username-input"
                type="text"
                placeholder="Логин"
                value={login}

                onChange={(event) => {

                    // ------ Изменяем состояние login ------ //
                    setLogin(event.target.value)
                }}
            />

            {/* ------ INPUT ПАРОЛЯ ------ */}

            <input
                className="Password-input"
                type="password"
                placeholder="Пароль"
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