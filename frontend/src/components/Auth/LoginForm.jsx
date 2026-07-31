// ------ Импорт API функции авторизации ------ //
import { loginUser } from './authApi'

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
    setMode

}) {

    // ------ Функция авторизации ------ //
    async function handleLogin() {

        try {

            // ------ POST запрос на backend сервер для авторизации ------ //
            // ------ Form JSON: { login, password } ------ //
            const response = await loginUser(
                login,
                password
            )

            // ------ Если сервер вернул успешную авторизацию ------ //
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

                onChange={(event) => {

                    // ------ Изменяем состояние password ------ //
                    setPassword(event.target.value)
                }}
            />

            {/* ------ КОНТЕЙНЕР КНОПОК ------ */}

            <section className="Buttons-container">

                {/* ------ КНОПКА АВТОРИЗАЦИИ ------ */}

                <button
                    className="Login-button"
                    type="button"

                    onClick={handleLogin}
                >
                    Войти
                </button>

                {/* ------ КНОПКА ПЕРЕХОДА В REGISTER ------ */}

                <button
                    className="Register-button"
                    type="button"

                    onClick={() => {

                        // ------ Переключение режима на register ------ //
                        setMode('register')
                    }}
                >
                    Регистрация
                </button>

            </section>
        </>
    )
}