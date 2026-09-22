import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Header from "../pages/Landing/components/Header/Header";
import { logoutUser } from "../pages/Landing/components/Hero/auth/authApi";
import logo from "../assets/logo.png";


const API_URL = import.meta.env.VITE_API_URL || "";

export function AppShell({
    active,
    account: accountProp,
    children,
    onLogin,
    onSectionChange,
    contentClassName = "",
}) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [account, setAccount] = useState(accountProp || null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (accountProp) {
            setAccount(accountProp);
        }
    }, [accountProp]);

    useEffect(() => {
        if (!token) {
            return undefined;
        }
        const controller = new AbortController();
        const headers = { Authorization: `Bearer ${token}` };

        if (!accountProp) {
            fetch(`${API_URL}/api/me`, { headers, signal: controller.signal })
                .then((response) => response.ok ? response.json() : null)
                .then((data) => data && setAccount(data))
                .catch(() => {});
        }

        fetch(`${API_URL}/api/admin/me`, { headers, signal: controller.signal })
            .then((response) => setIsAdmin(response.ok))
            .catch(() => setIsAdmin(false));

        return () => controller.abort();
    }, [accountProp, token]);

    function handleLogout() {
        setIsMenuOpen(false);
        logoutUser();
        navigate("/", { replace: true });
    }

    return (
        <div className={`kp-app-shell ${token ? "is-authenticated" : ""}`}>
            {token ? (
                <MenuToggle
                    menuOpen={isMenuOpen}
                    onMenuToggle={() => setIsMenuOpen((value) => !value)}
                    className="kp-floating-menu-control"
                />
            ) : (
                <InternalHeader menuOpen={isMenuOpen} onLogin={onLogin} />
            )}
            <AccountMenu
                open={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                active={active}
                account={account}
                isAdmin={isAdmin}
                onSectionChange={onSectionChange}
                onLogout={handleLogout}
            />
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

    function goToSection(section) {
        onClose();
        if (onSectionChange) onSectionChange(section);
        else navigate("/main", { state: { section } });
    }

    return (
        <>
            <button className={`kp-menu-backdrop ${open ? "is-open" : ""}`} type="button" aria-label="Закрыть меню аккаунта" onClick={onClose} />
            <aside className={`kp-side-menu ${open ? "is-open" : ""}`} aria-label="Меню аккаунта">
                <div className="kp-side-menu-head"><div><small>Личный кабинет</small><strong>{account?.login || "KING PROMOTION"}</strong></div><button type="button" onClick={onClose} aria-label="Закрыть меню">×</button></div>
                <div className="kp-side-menu-balance"><span>Баланс</span><strong>{account?.balance || "0.00"} ₽</strong></div>
                <nav className="kp-side-menu-links" aria-label="Разделы аккаунта">
                    <Link className={active === "catalog" ? "active" : ""} to="/catalog" onClick={onClose}>Каталог</Link>
                    <button className={active === "create" ? "active" : ""} type="button" onClick={() => goToSection("create")}>Создать заказ</button>
                    <button className={active === "orders" ? "active" : ""} type="button" onClick={() => goToSection("orders")}>Мои заказы</button>
                    <button className={active === "balance" ? "active" : ""} type="button" onClick={() => goToSection("balance")}>Баланс</button>
                    {isAdmin && <Link className={active === "admin" ? "active" : ""} to="/admin" onClick={onClose}>Админ-панель</Link>}
                </nav>
                <button className="kp-side-menu-logout" type="button" onClick={onLogout}>Выйти</button>
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
    if (/заверш|completed/.test(normalized)) tone = "success";
    else if (/ожида|pending|отправ|выполня|progress/.test(normalized)) tone = "progress";
    else if (/провер|unknown|отклон|cancel|ошиб/.test(normalized)) tone = "warning";
    return <span className={`kp-status kp-status--${tone}`}><i />{children || status}</span>;
}

export function EmptyState({ children }) {
    return <div className="kp-empty-state">{children}</div>;
}
