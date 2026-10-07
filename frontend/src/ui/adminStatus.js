import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT } from "../pages/Landing/components/Hero/auth/authApi";

const API_URL = import.meta.env.VITE_API_URL || "";

/* Права администратора подтверждает только backend (/api/admin/me).
   Раньше этот запрос делали и AppShell, и каталог — по одному на компонент.
   Держим ответ здесь: один запрос на токен, остальные берут готовый результат. */
let checkedToken = null; // токен, для которого получен ответ
let isAdmin = false;
let known = false; // ответ для checkedToken уже получен
let pending = null; // запрос в полёте — второй раз его не отправляем

function currentToken() {
    try {
        return localStorage.getItem("token");
    } catch (error) {
        /* приватный режим — считаем, что токена нет */
        return null;
    }
}

/* null — проверка ещё идёт; true/false — права уже известны.
   Без токена админом быть нельзя, поэтому сразу false. */
export function getCachedIsAdmin() {
    const token = currentToken();
    if (!token) return false;
    return known && token === checkedToken ? isAdmin : null;
}

/* Промис с правами текущего токена. Повторные вызовы не создают новых запросов. */
export function loadIsAdmin() {
    const token = currentToken();

    if (!token) {
        checkedToken = null;
        isAdmin = false;
        known = true;
        return Promise.resolve(false);
    }
    if (known && token === checkedToken) return Promise.resolve(isAdmin);
    if (pending && token === checkedToken) return pending;

    checkedToken = token;
    known = false;

    let request = null;
    request = fetch(`${API_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => {
            isAdmin = response.ok;
            known = true;
            return isAdmin;
        })
        .catch(() => {
            /* Сеть подвела — ответ не кэшируем, следующая попытка сходит снова. */
            isAdmin = false;
            known = false;
            return false;
        })
        .finally(() => {
            if (pending === request) pending = null;
        });

    pending = request;
    return request;
}

/* Хук для компонентов: права пересчитываются при входе и выходе из аккаунта. */
export function useIsAdmin() {
    const [state, setState] = useState(getCachedIsAdmin);

    useEffect(() => {
        let active = true;

        const sync = () => {
            loadIsAdmin().then((value) => {
                if (active) setState(value);
            });
        };

        sync();
        window.addEventListener(AUTH_CHANGED_EVENT, sync);
        return () => {
            active = false;
            window.removeEventListener(AUTH_CHANGED_EVENT, sync);
        };
    }, []);

    return state;
}
