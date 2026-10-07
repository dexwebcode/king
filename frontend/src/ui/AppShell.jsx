import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import Header from "../pages/Landing/components/Header/Header";
import Footer from "../pages/Landing/components/Footer/Footer";
import { logoutUser } from "../pages/Landing/components/Hero/auth/authApi";
import { useIsAdmin } from "./adminStatus";
import { setUserView, useUserView } from "./viewMode";
import { getAccount, getCachedAccount, refreshAccount, subscribeAccount } from "./dataCache";
import { formatMoney } from "./catalogMeta";
import { useLanguage } from "./i18n";
import { formatUsd, useUsdRate } from "./usdRate";
import logo from "../assets/logo.png";


/* Разделы меню аккаунта — обычные, как у всех пользователей: выводятся
   по длине названия, от самого длинного к самому короткому (см. AccountMenu).
   У админа в режиме «Обычная страница» к ним добавляется «Админ-панель»,
   а без этого режима меню состоит из двух «страниц»: панель и сайт. */
const MENU_ITEMS = [
    { key: "account", label: "Личный кабинет", to: "/account" },
    { key: "catalog", label: "Каталог услуг", to: "/catalog" },
    { key: "orders", label: "Заказы", section: "orders" },
    { key: "support", label: "Поддержка", to: "/support" },
    { key: "reviews", label: "Оставить отзыв", to: "/reviews" },
];

const ADMIN_MENU_ITEMS = [
    { key: "admin", label: "Админ-панель", to: "/admin" },
    { key: "site", label: "Обычная страница", to: "/catalog", userView: true },
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
    headerAside = null,
}) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const [account, setAccount] = useState(() => accountProp || getCachedAccount());
    /* Права админа берём из общего кэша: /api/admin/me отправляется один раз
       на токен, а не из каждого компонента. */
    const isAdmin = useIsAdmin() === true;
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

    function handleLogout() {
        setIsMenuOpen(false);
        /* Выход сбрасывает режим «Обычная страница»: администратор в любом
           случае возвращается в Dashboard админ-панели, а не на витрину. */
        setUserView(false);
        logoutUser();
        navigate("/", { replace: true });
    }

    return (
        <div className={`kp-app-shell ${token ? "is-authenticated" : ""} ${isMenuOpen ? "is-menu-open" : ""}`.trim()}>
            {!token && (
                <InternalHeader menuOpen={isMenuOpen} onLogin={onLogin} />
            )}
            {/* Полоса раздела — та же, что строка каталога: логотип, название,
                те же размеры и отступы. */}
            <header className="kp-section-bar">
                {token && (
                    <MenuToggle
                        menuOpen={isMenuOpen}
                        onMenuToggle={() => setIsMenuOpen((value) => !value)}
                        className="kp-section-menu-toggle"
                    />
                )}
                <h1 className={`kp-section-title ${titleClassName}`.trim()}>{title}</h1>
                {headerAside}
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
            {/* У вошедшего подвала нет нигде, кроме главной: там он свой. */}
            {!token && <Footer />}
        </div>
    );
}

export function InternalHeader({ menuOpen = false, onMenuToggle, onLogin, showAuthenticatedMenu = true }) {
    const token = localStorage.getItem("token");
    const { t } = useLanguage();
    return (
        <Header
            showAuthButton={!token || showAuthenticatedMenu}
            initiallyDark
            actionLabel={token ? t("Меню") : t("Авторизация")}
            onAction={token ? onMenuToggle : onLogin}
        />
    );
}

export function MenuToggle({ menuOpen = false, onMenuToggle, className = "" }) {
    const { t } = useLanguage();
    return (
        <button className={`kp-menu-toggle ${menuOpen ? "is-open" : ""} ${className}`.trim()} type="button" aria-label={t("Открыть меню аккаунта")} aria-expanded={menuOpen} onClick={onMenuToggle}>
            <img src={logo} alt="" />
        </button>
    );
}

export function AccountMenu({ open, onClose, active, account, isAdmin = false, onSectionChange, onLogout }) {
    const navigate = useNavigate();
    const token = localStorage.getItem("token");
    const { lang, setLang, t } = useLanguage();
    const usdRate = useUsdRate();
    /* Админ в режиме «Обычная страница» видит обычное меню пользователя. */
    const userView = useUserView();
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

    /* Обычное меню пользователя плюс «Админ-панель» — у админа в режиме
       просмотра сайта как пользователя. В самой панели меню короткое:
       «Админ-панель» и «Обычная страница». */
    const menuItems = isAdmin && !userView
        ? ADMIN_MENU_ITEMS
        : (isAdmin
            ? [{ key: "admin", label: "Админ-панель", to: "/admin" }, ...MENU_ITEMS]
            : MENU_ITEMS
        ).sort((first, second) => second.label.length - first.label.length);

    function goToSection(section) {
        onClose();
        if (onSectionChange) {
            onSectionChange(section);
            return;
        }
        window.setTimeout(() => navigate("/main", { state: { section } }), MENU_CLOSE_MS);
    }

    function goToPage(item) {
        onClose();
        /* Переключение «страниц» админа: сайт как пользователь или админ-панель. */
        if (item.userView) setUserView(true);
        window.setTimeout(() => navigate(item.to), MENU_CLOSE_MS);
    }

    /* Пункт «Админ-панель» выключает режим просмотра сайта как пользователя. */
    function handleAdminPageClick() {
        setUserView(false);
    }

    return (
        <>
            {/* Затемнение вынесено в портал: шапка раздела из-за backdrop-filter
                становится containing block для position: fixed, и оверлей
                внутри неё накрывал только саму шапку вместо всей страницы. */}
            {createPortal(
                <button className={`kp-menu-backdrop ${open ? "is-open" : ""}`} type="button" aria-label={t("Закрыть меню аккаунта")} onClick={onClose} />,
                document.body,
            )}
            <aside
                className={`kp-side-menu${phase === "open" ? " is-open" : ""}${phase === "starting" ? " is-starting" : ""}`}
                aria-label={t("Меню аккаунта")}
                aria-hidden={!open}
            >
                <div className="kp-side-menu-head">
                    <div><small>KingPromotion</small><strong>{(liveAccount || account)?.login || "KING PROMOTION"}</strong></div>
                    <div className="kp-side-menu-head-actions">
                        <div className="kp-lang-switch" role="group" aria-label="Language">
                            <button type="button" className={lang === "ru" ? "is-active" : ""} aria-pressed={lang === "ru"} onClick={() => setLang("ru")}>RU</button>
                            <button type="button" className={lang === "en" ? "is-active" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
                        </div>
                        <button className="kp-side-menu-logout" type="button" onClick={() => { onClose(); window.setTimeout(onLogout, MENU_CLOSE_MS); }}>{t("Выйти")}</button>
                    </div>
                </div>
                <button className="kp-side-menu-balance" type="button" onClick={() => goToSection("balance")}><span>{t("Баланс")}</span><strong>{lang === "en" && usdRate != null ? formatUsd((liveAccount || account)?.balance, usdRate) : `${formatMoney((liveAccount || account)?.balance)} ₽`}</strong></button>
                <nav className="kp-side-menu-links" aria-label={t("Разделы аккаунта")}>
                    {menuItems.map((item) => (
                        item.to ? (
                            <Link
                                key={item.key}
                                className={active === item.key ? "active" : ""}
                                to={item.to}
                                onClick={(event) => {
                                    event.preventDefault();
                                    if (item.key === "admin") handleAdminPageClick();
                                    goToPage(item);
                                }}
                            >
                                {t(item.label)}
                            </Link>
                        ) : (
                            <button
                                key={item.key}
                                className={active === item.section ? "active" : ""}
                                type="button"
                                onClick={() => goToSection(item.section)}
                            >
                                {t(item.label)}
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
