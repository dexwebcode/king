import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import "./AdminLayout.css";

import { adminApi } from "../adminApi";
import logo from "../../../assets/logo.png";

const SECTIONS = [
    { key: "dashboard", to: "/admin", label: "Dashboard", end: true },
    { key: "orders", to: "/admin/orders", label: "Заказы" },
    { key: "users", to: "/admin/users", label: "Пользователи" },
    { key: "reviews", to: "/admin/reviews", label: "Отзывы" },
    { key: "support", to: "/admin/support", label: "Поддержка" },
    { key: "finance", to: "/admin/finance", label: "Финансы" },
    { key: "analytics", to: "/admin/analytics", label: "Аналитика" },
    { key: "markup", to: "/admin/markup", label: "Наценка" },
    { key: "logs", to: "/admin/audit-log", label: "Логи" },
];

function Icon({ name }) {
    const paths = {
        dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
        orders: <><path d="M4 5h16l-1.6 7.2a2 2 0 0 1-2 1.6H8.2a2 2 0 0 1-1.9-1.4L4 5Zm0 0 1.5-2.5" /><circle cx="9" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
        users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.5a4.6 4.6 0 0 1 4.5 4.5" /></>,
        reviews: <><path d="m12 3.5 2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8 2.5-5Z" /></>,
        support: <><path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6l-4.5 3.5V15H7a3 3 0 0 1-3-3V6Z" /></>,
        finance: <><path d="M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M9.5 8.5h2.2a2 2 0 0 1 0 4h-2.2a2 2 0 0 0 0 4H12M11.5 7.5v9.5" /></>,
        analytics: <><path d="M4 19V9M10 19V5M16 19v-7M21 19H3" /></>,
        markup: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.6" /><circle cx="17" cy="17" r="2.6" /></>,
        logs: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
    };
    return (
        <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths[name] || paths.logs}
        </svg>
    );
}

function sectionForPath(pathname) {
    const match = SECTIONS.find((section) =>
        section.end ? pathname === section.to : pathname.startsWith(section.to)
    );
    return match || SECTIONS[0];
}

export default function AdminLayout({ children }) {
    const location = useLocation();
    const [status, setStatus] = useState("loading");
    // Меню по умолчанию свёрнуто до иконок и выдвигается при наведении.
    // Кнопка «закрепить» оставляет его развёрнутым (состояние запоминается).
    const [pinned, setPinned] = useState(() => {
        try {
            return localStorage.getItem("kp_admin_menu_pinned") === "1";
        } catch (error) {
            return false;
        }
    });
    const section = sectionForPath(location.pathname);

    function togglePinned() {
        setPinned((value) => {
            const next = !value;
            try {
                localStorage.setItem("kp_admin_menu_pinned", next ? "1" : "0");
            } catch (error) {
                /* приватный режим — не критично */
            }
            return next;
        });
    }

    useEffect(() => {
        let active = true;
        adminApi
            .me()
            .then(() => active && setStatus("ok"))
            .catch((error) => {
                if (!active) return;
                setStatus(error.status === 403 ? "forbidden" : error.status === 401 ? "unauthorized" : "error");
            });
        return () => {
            active = false;
        };
    }, []);

    if (status === "loading") {
        return (
            <div className="admin-boot" role="status">
                <p>Проверяем права администратора…</p>
            </div>
        );
    }

    if (status !== "ok") {
        return (
            <div className="admin-boot">
                <div className="admin-denied">
                    <p className="kp-eyebrow">
                        {status === "forbidden" ? "403 · доступ запрещён" : status === "unauthorized" ? "401 · нужен вход" : "Ошибка проверки прав"}
                    </p>
                    <h1>Админ-панель недоступна</h1>
                    <p>
                        {status === "forbidden"
                            ? "У текущего аккаунта нет административных прав. Обратитесь к владельцу проекта: роль выдаётся через ADMIN_USER_IDS."
                            : status === "unauthorized"
                                ? "Войдите в аккаунт администратора."
                                : "Не удалось проверить права администратора. Попробуйте позже."}
                    </p>
                    <Link className="kp-button" to="/main">Вернуться в кабинет</Link>
                </div>
            </div>
        );
    }

    return (
        <div className={`admin-shell ${pinned ? "is-pinned" : ""}`}>
            {/* Выдвижение меню при наведении — на CSS (см. AdminLayout.css),
                поэтому лишних обработчиков здесь нет. */}
            <aside className="admin-sidebar">
                <Link className="admin-brand" to="/admin" title="KingPromotion · админ-панель">
                    <img src={logo} alt="" />
                    <span className="admin-brand-text">
                        <strong>KingPromotion</strong>
                        <small>Админ-панель</small>
                    </span>
                </Link>
                <nav className="admin-nav" aria-label="Разделы админ-панели">
                    {SECTIONS.map((item) => (
                        <NavLink
                            key={item.key}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => `admin-nav-link${isActive ? " is-active" : ""}`}
                            title={item.label}
                        >
                            <Icon name={item.key} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="admin-sidebar-foot">
                    <button
                        className="admin-collapse"
                        type="button"
                        onClick={togglePinned}
                        aria-pressed={pinned}
                        aria-label={pinned ? "Свернуть меню до иконок" : "Закрепить меню развёрнутым"}
                        title={pinned ? "Свернуть до иконок" : "Закрепить меню"}
                    >
                        {pinned ? "«" : "»"}
                    </button>
                    <Link className="admin-site-link" to="/main" title="На сайт">
                        <Icon name="dashboard" />
                        <span>На сайт</span>
                    </Link>
                </div>
            </aside>
            <div className="admin-main">
                <main className="admin-content">
                    <header className="admin-topbar">
                        <div>
                            <p className="kp-eyebrow">KingPromotion · операционный центр</p>
                            <h1>{section.label}</h1>
                        </div>
                        <Link className="kp-button kp-button--secondary kp-button--small" to="/main">
                            Открыть сайт
                        </Link>
                    </header>
                    {children}
                </main>
            </div>
        </div>
    );
}
