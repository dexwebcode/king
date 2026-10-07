import { useEffect, useState } from "react";

import { AUTH_CHANGED_EVENT } from "../pages/Landing/components/Hero/auth/authApi";

/* Режим просмотра для администратора.
   По умолчанию админ попадает в админ-панель, а витрина и клиентские разделы
   уводят его обратно в /admin. В режиме «как обычный пользователь» этого
   редиректа нет: админ ходит по сайту как тестовый пользователь, а вернуться
   в панель можно пунктом меню «Админ-панель». */
const STORAGE_KEY = "kp_admin_user_view";
const VIEW_MODE_EVENT = "kp:view-mode-changed";

export function isUserView() {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (error) {
        return false;
    }
}

export function setUserView(value) {
    const next = Boolean(value);
    try {
        if (isUserView() === next) return;
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch (error) {
        /* приватный режим — работаем без запоминания */
    }
    window.dispatchEvent(new Event(VIEW_MODE_EVENT));
}

export function useUserView() {
    const [state, setState] = useState(isUserView);

    useEffect(() => {
        const sync = () => setState(isUserView());
        window.addEventListener(VIEW_MODE_EVENT, sync);
        window.addEventListener(AUTH_CHANGED_EVENT, sync);
        return () => {
            window.removeEventListener(VIEW_MODE_EVENT, sync);
            window.removeEventListener(AUTH_CHANGED_EVENT, sync);
        };
    }, []);

    return state;
}
