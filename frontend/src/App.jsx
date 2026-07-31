import { useEffect, useState } from 'react'

import Auth from './components/Auth/Auth'

import Home from './components/Home/Home'
import { isAuth } from './components/Auth/authApi'

export default function App() {

    const [auth, setAuth] = useState(false)

    const [loading, setLoading] = useState(true)

    useEffect(() => {

        async function initAuth() {

            const status = await isAuth()

            setAuth(status)

            setLoading(false)
        }

        initAuth()

    }, [])

    if (loading) {

        return (
            <h1>
                Загрузка...
            </h1>
        )
    }

    return (
        <>

            {!auth && (

                <Auth setIsAuth={setAuth} />
            )}

            {auth && (

                <Home />
            )}

        </>
    )
}