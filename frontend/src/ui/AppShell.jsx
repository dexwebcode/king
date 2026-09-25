import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Header from "../pages/Landing/components/Header/Header";
import { logoutUser } from "../pages/Landing/components/Hero/auth/authApi";
import { getAccount, getCachedAccount, refreshAccount, subscribeAccount } from "./dataCache";
import { formatMoney } from "./catalogMeta";
import logo from "../assets/logo.png";


const API_URL = import.meta.env.VITE_API_URL || "";

/* Разделы меню аккаунта. Выводятся отсортированными по длине названия —
   от самого длинного к самому короткому (см. AccountMenu). */
const MENU_ITEMS = [
    { key: "admin", label: "Админ-панель", to: "/admin", adminOnly: true },
    { key: "account", label: "Личный кабинет", to: "/account" },
    { key: "catalog", label: "Каталог услуг", to: "/catalog" },
    { key: "orders", label: "Заказы", section: "orders" },
    { key: "support", label: "Поддержка", to: "/support" },
    { key: "reviews", label: "Отзывы", to: "/reviews" },
    { key: "faq", label: "FAQ", to: "/faq" },
];

export function AppShell({
    active,
    account: accountProp,
    children,
    onLogin,
    onSectionChange,
    contentClassName = "",
    title = "Личный кабинет",
    titleClassName = "",
}) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [account, setAccount] = useState(() => accountProp || getCachedAccount());
    const [isAdmin, setIsAdmin] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (accountProp) {
            setAccount(accountProp);
            return undefined;
        }
        if (!token) {
            setAccount(null);
            return undefined;
        }

        setAccount(getCachedAccount());
        const unsubscribe = subscribeAccount(setAccount);
        getAccount().catch(() => { });
        return unsubscribe;
    }, [accountProp, token]);

    useEffect(() => {
        if (!token) {
            return undefined;
        }
        const controller = new AbortController();
        const headers = { Authorization: `Bearer ${token}` };

        fetch(`${API_URL}/api/admin/me`, { headers, signal: controller.signal })
            .then((response) => setIsAdmin(response.ok))
            .catch(() => setIsAdmin(false));

        return () => controller.abort();
    }, [token]);

    function handleLogout() {
        setIsMenuOpen(false);
        logoutUser();
        navigate("/", { replace: true });
    }

    return (
        <div className={`kp-app-shell ${token ? "is-authenticated" : ""}`}>
            {!token && (
                <InternalHeader menuOpen={isMenuOpen} onLogin={onLogin} />
            )}
            <header className="kp-section-bar">
                {token && (
                    <MenuToggle
                        menuOpen={isMenuOpen}
                        onMenuToggle={() => setIsMenuOpen((value) => !value)}
                        className="kp-section-menu-toggle"
                    />
                )}
                <h1 className={`kp-section-title ${titleClassName}`.trim()}>{title}</h1>
                <AccountMenu
                    open={isMenuOpen}
                    onClose={() => setIsMenuOpen(false)}
                    active={active}
                    account={account}
                    isAdmin={isAdmin}
                    onSectionChange={onSectionChange}
                    onLogout={handleLogout}
                />
            </header>
            <main className={`kp-page ${contentClassName}`}>{children}</main>
        </div>
    );
}

export function InternalHeader({ menuOpen = false, onMenuToggle, onLogin, showAuthenticatedMenu = true }) {
    const token = localStorage.getItem("token");
    return (
        <Header
            showAuthButton={!token || showAuthenticatedMenu}
            initiallyDark
            actionLabel={token ? "Меню" : "Авторизация"}
            onAction={token ? onMenuToggle : onLogin}
        />
    );
}

export function MenuToggle({ menuOpen = false, onMenuToggle, className = "" }) {
    return (
        <button className={`kp-menu-toggle ${menuOpen ? "is-open" : ""} ${className}`.trim()} type="button" aria-label="Открыть меню аккаунта" aria-expanded={menuOpen} onClick={onMenuToggle}>
            <img src={logo} alt="" />
        </button>
    );
}

export function AccountMenu({ open, onClose, active, account, isAdmin = false, onSectionChange, onLogout }) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    /* Разворот панели идёт в два шага: сначала выставляем свёрнутое состояние,
       на следующем кадре — раскрытое. Так анимация гарантированно проигрывается
       при каждом открытии, а не только при первом. */
    const [phase, setPhase] = useState("closed");
    /* Баланс показываем из свежего ответа сервера, а не из кэша. */
    const [liveAccount, setLiveAccount] = useState(account);

    useEffect(() => {
        setLiveAccount(account);
    }, [account]);

    useEffect(() => {
        if (!open || !token) return undefined;

        let isCurrent = true;
        refreshAccount()
            .then((data) => { if (isCurrent && data) setLiveAccount(data); })
            .catch(() => { });
        return () => { isCurrent = false; };
    }, [open, token]);

    useLayoutEffect(() => {
        if (!open) {
            setPhase("closed");
            return undefined;
        }
        setPhase("starting");
        const frame = requestAnimationFrame(() => setPhase("open"));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [open, onClose]);

    if (!token) return null;

    /* Навигация размонтирует меню, поэтому даём ему время раствориться — иначе
       переход в другой раздел обрывает анимацию. */
    const MENU_CLOSE_MS = 220;

    /* Разделы — от самого длинного названия к самому короткому. */
    const menuItems = MENU_ITEMS
        .filter((item) => !item.adminOnly || isAdmin)
        .sort((first, second) => second.label.length - first.label.length);

    function goToSection(section) {
        onClose();
        if (onSectionChange) {
            onSectionChange(section);
            return;
        }
        window.setTimeout(() => navigate("/main", { state: { section } }), MENU_CLOSE_MS);
    }

    function goToPage(path) {
        onClose();
        window.setTimeout(() => navigate(path), MENU_CLOSE_MS);
    }

    return (
        <>
            <button className={`kp-menu-backdrop ${open ? "is-open" : ""}`} type="button" aria-label="Закрыть меню аккаунта" onClick={onClose} />
            <aside
                className={`kp-side-menu${phase === "open" ? " is-open" : ""}${phase === "starting" ? " is-starting" : ""}`}
                aria-label="Меню аккаунта"
                aria-hidden={!open}
            >
                <div className="kp-side-menu-head"><div><small>KingPromotion</small><strong>{(liveAccount || account)?.login || "KING PROMOTION"}</strong></div><button className="kp-side-menu-logout" type="button" onClick={() => { onClose(); window.setTimeout(onLogout, MENU_CLOSE_MS); }}>Выйти</button></div>
                <button className="kp-side-menu-balance" type="button" onClick={() => goToSection("balance")}><span>Баланс</span><strong>{formatMoney((liveAccount || account)?.balance)} ₽</strong></button>
                <nav className="kp-side-menu-links" aria-label="Разделы аккаунта">
                    {menuItems.map((item) => (
                        item.to ? (
                            <Link
                                key={item.key}
                                className={active === item.key ? "active" : ""}
                                to={item.to}
                                onClick={(event) => { event.preventDefault(); goToPage(item.to); }}
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <button
                                key={item.key}
                                className={active === item.section ? "active" : ""}
                                type="button"
                                onClick={() => goToSection(item.section)}
                            >
                                {item.label}
                            </button>
                        )
                    ))}
                </nav>
            </aside>
        </>
    );
}

export function PageHeader({ eyebrow, title, description, actions }) {
    return (
        <header className="kp-page-header">
            <div>
                {eyebrow && <p className="kp-eyebrow">{eyebrow}</p>}
                <h1>{title}</h1>
                {description && <p className="kp-page-description">{description}</p>}
            </div>
            {actions && <div className="kp-page-actions">{actions}</div>}
        </header>
    );
}

export function Panel({ as: Element = "section", className = "", children }) {
    return <Element className={`kp-panel ${className}`}>{children}</Element>;
}

export function StatusBadge({ status, children }) {
    const normalized = String(status || "").toLowerCase();
    let tone = "neutral";
    if (/заверш|выполнен|готово|completed/.test(normalized)) tone = "success";
    else if (/оплач|ожида|pending|отправ|выполня|progress/.test(normalized)) tone = "progress";
    else if (/провер|unknown|отклон|отмен|недоступ|cancel|ошиб/.test(normalized)) tone = "warning";
    return <span className={`kp-status kp-status--${tone}`}><i />{children || status}</span>;
}

export function EmptyState({ children }) {
    return <div className="kp-empty-state">{children}</div>;
}
