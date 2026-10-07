import { useCallback, useEffect, useRef, useState } from "react";
import * as VKID from "@vkid/sdk";

import { AppShell, Panel, StatusBadge as OrderStatusBadge } from "../../ui/AppShell";
import { displayPlatform, formatMoney } from "../../ui/catalogMeta";
import {
    connectVk,
    createTelegramSession,
    getTelegramSessionStatus,
} from "../Landing/components/Hero/auth/authApi";
import { validatePassword } from "../Landing/components/Hero/auth/validatePassword";
import {
    getAccountDetails,
    getCachedAccountDetails,
    refreshAccountDetails,
    subscribeAccountDetails,
} from "../../ui/dataCache";
import { useLanguage } from "../../ui/i18n";
import { useNotifications } from "../../ui/notifications";
import { accountApi } from "./accountApi";
import telegramIcon from "../../assets/social_icons/telegram.svg";
import vkIcon from "../../assets/social_icons/vk.svg";
import "./Account.css";

const VK_APP_ID = 54737931;
const VK_REDIRECT_URL = "https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback";

/* Заказы в кабинете разложены по трём вкладкам. */
const ORDER_TABS = [
    { key: "active", label: "Активные" },
    { key: "done", label: "Завершённые" },
    { key: "canceled", label: "Отменённые" },
];

/* Вкладка заказа по покупательскому статусу с backend. */
function orderTab(order) {
    const status = String(order?.display_status || order?.status || "").toLowerCase();
    if (/выполнен|заверш|готово|completed/.test(status)) return "done";
    if (/отменён|отменен|отклон|cancel|reject/.test(status)) return "canceled";
    return "active";
}

/* Простая проверка формата Email — до запроса на backend. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Деталь ошибки от API может быть строкой, списком ошибок валидации FastAPI
   ([{ msg: "..." }]) или объектом — достаём из неё читаемый текст. */
function errorText(value, fallback = "Не удалось выполнить действие.") {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) return errorText(value[0], fallback);
    if (value && typeof value === "object") {
        return errorText(value.msg || value.detail || value.message, fallback);
    }
    return fallback;
}

/* Плашка состояния подключения — всегда в правом верхнем углу карточки. */
function StatusBadge({ connected }) {
    const { t } = useLanguage();
    return connected ? (
        <span className="account-badge account-badge--connected">{t("Подключено")}</span>
    ) : (
        <span className="account-badge account-badge--muted">{t("Не подключено")}</span>
    );
}

function ConnectionCard({ icon, title, children, actions, className = "", status }) {
    const { t } = useLanguage();
    return (
        <article className={`account-card ${className}${actions ? " has-actions" : ""}`.trim()}>
            <div className="account-card-head">
                {icon && (
                    <span className="account-card-icon">
                        <img src={icon} alt="" aria-hidden="true" />
                    </span>
                )}
                {title && <h2>{t(title)}</h2>}
                {status && <span className="account-card-status">{status}</span>}
            </div>
            {children ? <div className="account-card-body">{children}</div> : null}
            {actions && <div className="account-card-actions">{actions}</div>}
        </article>
    );
}

export default function AccountPage() {
    const { t } = useLanguage();
    /* Уведомления о подключении способов входа уходят в общий буфер (справа сверху). */
    const { push } = useNotifications();
    const [account, setAccount] = useState(getCachedAccountDetails);
    const [loading, setLoading] = useState(() => !getCachedAccountDetails());
    const [connecting, setConnecting] = useState(null);
    const [emailValue, setEmailValue] = useState("");
    const [emailSubmitting, setEmailSubmitting] = useState(false);
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [ordersTab, setOrdersTab] = useState("active");
    const [referrals, setReferrals] = useState(null);

    const [credentialsLogin, setCredentialsLogin] = useState("");
    const [credentialsPassword, setCredentialsPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [credentialsSubmitting, setCredentialsSubmitting] = useState(false);
    /* Личность подтверждена текущим паролем — только тогда поля открываются. */
    const [passwordVerified, setPasswordVerified] = useState(false);
    const [checkingPassword, setCheckingPassword] = useState(false);

    const pollTimerRef = useRef(null);
    const tgWindowRef = useRef(null);

    /* Все ошибки и подсказки кабинета показываем через общий буфер уведомлений.
       Ответ API бывает строкой, списком ошибок валидации или объектом —
       сводим его к одной понятной фразе, чтобы не показывать «[object Object]». */
    const pushError = useCallback(
        (value) => {
            if (value) push(t(errorText(value)), { tone: "error" });
        },
        [push, t]
    );

    /* Данные аккаунта берём из общего кэша: он прогрет при входе,
       поэтому повторной загрузки при открытии страницы не будет. */
    const load = useCallback(async ({ force = false } = {}) => {
        try {
            const data = force ? await refreshAccountDetails() : await getAccountDetails();
            if (data) setAccount(data);
        } catch (requestError) {
            pushError(requestError?.message || t("Не удалось загрузить аккаунт."));
        }
    }, [pushError, t]);

    const reload = useCallback(() => load({ force: true }), [load]);

    /* Заказы и рефералы кабинета — отдельные запросы, кэш аккаунта их не содержит. */
    useEffect(() => {
        let active = true;
        accountApi
            .myOrders()
            .then((response) => {
                if (active && response.ok) setOrders(Array.isArray(response.data?.items) ? response.data.items : []);
            })
            .catch(() => {})
            .finally(() => {
                if (active) setOrdersLoading(false);
            });
        accountApi
            .referrals()
            .then((response) => {
                if (active && response.ok) setReferrals(response.data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeAccountDetails((next) => {
            if (next) setAccount(next);
        });
        load().finally(() => setLoading(false));
        return () => {
            unsubscribe();
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        };
    }, [load]);

    function stopPolling() {
        if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }

    /* Окно Telegram-бота закрываем сами — как при авторизации через Telegram. */
    function closeTelegramWindow() {
        const tgWindow = tgWindowRef.current;
        tgWindowRef.current = null;
        if (tgWindow && !tgWindow.closed) {
            try {
                tgWindow.close();
            } catch {
                /* Браузер может запретить закрытие — окно закроет пользователь. */
            }
        }
    }

    function pollTelegram(token) {
        stopPolling();
        pollTimerRef.current = window.setInterval(async () => {
            const response = await getTelegramSessionStatus(token);
            if (!response.ok) {
                stopPolling();
                pushError(response.data?.detail || t("Ошибка проверки Telegram."));
                setConnecting(null);
                return;
            }
            const status = response.data?.status;
            if (status === "connected") {
                stopPolling();
                /* Старт нажат — окно бота больше не нужно. */
                closeTelegramWindow();
                push(t("Telegram подключён."));
                setConnecting(null);
                reload();
            } else if (status === "conflict") {
                stopPolling();
                pushError(t("Этот Telegram-аккаунт уже связан с другим аккаунтом."));
                setConnecting(null);
            } else if (status === "expired" || status === "not_found") {
                stopPolling();
                pushError(t("Сессия подключения истекла. Попробуйте ещё раз."));
                setConnecting(null);
            }
        }, 2500);
    }

    async function handleConnectTelegram() {
        setConnecting("telegram");
        const tgWindow = window.open("about:blank", "_blank");
        try {
            const response = await createTelegramSession();
            if (!response.ok || !response.data?.success) {
                tgWindow?.close();
                pushError(response.data?.detail || t("Не удалось начать подключение Telegram."));
                setConnecting(null);
                return;
            }
            const { token, bot_url } = response.data;
            if (!token || !bot_url) {
                tgWindow?.close();
                pushError(t("Telegram-бот не настроен на backend."));
                setConnecting(null);
                return;
            }
            push(t("Откройте Telegram и нажмите Start."), { tone: "info" });
            tgWindowRef.current = tgWindow || null;
            if (tgWindow) {
                tgWindow.location.href = bot_url;
            } else {
                window.open(bot_url, "_blank", "noopener,noreferrer");
            }
            pollTelegram(token);
        } catch {
            tgWindow?.close();
            pushError(t("Не удалось подключиться к серверу."));
            setConnecting(null);
        }
    }

    async function handleConnectVk() {
        setConnecting("vk");
        try {
            VKID.Config.init({
                app: VK_APP_ID,
                redirectUrl: VK_REDIRECT_URL,
                responseMode: VKID.ConfigResponseMode.Callback,
                mode: VKID.ConfigAuthMode.InNewWindow,
                source: VKID.ConfigSource.LOWCODE,
                scope: "email",
            });
            const authPayload = await VKID.Auth.login();
            const tokenPayload = await VKID.Auth.exchangeCode(
                authPayload.code,
                authPayload.device_id
            );
            const response = await connectVk(tokenPayload.access_token);
            if (!response.ok) {
                pushError(response.data?.detail || t("Не удалось подключить VK."));
                return;
            }
            push(t("VK подключён."));
            reload();
        } catch (vkError) {
            pushError(
                vkError?.error_description || vkError?.error || t("VK подключение не завершено.")
            );
        } finally {
            setConnecting(null);
        }
    }

    /* Отключение способа входа: telegram, vk или email. */
    async function handleDisconnect(provider) {
        /* У Email отдельный маршрут: он не входит в social-подключения. */
        const response =
            provider === "email"
                ? await accountApi.removeEmail()
                : await accountApi.disconnect(provider);
        if (response.ok) {
            push(
                provider === "telegram"
                    ? t("Telegram отключён.")
                    : provider === "vk"
                        ? t("VK отключён.")
                        : t("Email отключён.")
            );
            reload();
        } else {
            pushError(response.data?.detail || t("Не удалось отключить способ входа."));
        }
    }

    async function handleAddEmail(event) {
        event.preventDefault();
        const email = emailValue.trim();
        if (!email) return;
        if (!EMAIL_PATTERN.test(email)) {
            pushError(t("Введите корректный Email, например example@gmail.com."));
            return;
        }
        setEmailSubmitting(true);
        const response = await accountApi.addEmail(email);
        if (response.ok) {
            push(t("Email добавлен."));
            setEmailValue("");
            reload();
        } else {
            pushError(response.data?.detail || t("Не удалось добавить Email."));
        }
        setEmailSubmitting(false);
    }

    /* После сохранения очищаем введённые пароли; сама секция всегда раскрыта. */
    function resetCredentials() {
        setCredentialsPassword("");
        setCurrentPassword("");
        setPasswordVerified(false);
    }

    async function handleVerifyPassword() {
        const value = currentPassword.trim();
        if (!value) {
            pushError(t("Введите текущий пароль."));
            return;
        }
        setCheckingPassword(true);
        const response = await accountApi.verifyPassword(value);
        if (response.ok) {
            setPasswordVerified(true);
        } else {
            setPasswordVerified(false);
            pushError(response.data?.detail || t("Неверный пароль."));
        }
        setCheckingPassword(false);
    }

    async function handleCredentialsSubmit(event) {
        event.preventDefault();
        const login = credentialsLogin.trim().toLowerCase();

        if (login.length < 3 || login.length > 40 || /\s/.test(login)) {
            pushError(t("Логин: от 3 до 40 символов, без пробелов."));
            return;
        }
        if (!account.has_password && !credentialsPassword) {
            pushError(t("Придумайте пароль для входа по логину."));
            return;
        }
        if (credentialsPassword) {
            const hint = validatePassword(credentialsPassword);
            if (hint) {
                pushError(hint);
                return;
            }
        }
        if (account.has_password && !passwordVerified) {
            pushError(t("Сначала подтвердите текущий пароль кнопкой «Проверить»."));
            return;
        }

        setCredentialsSubmitting(true);
        const response = await accountApi.setCredentials({
            login,
            password: credentialsPassword || null,
            current_password: currentPassword || null,
        });
        if (response.ok) {
            push(t("Логин и пароль сохранены."));
            resetCredentials();
            reload();
        } else {
            pushError(response.data?.detail || t("Не удалось сохранить логин и пароль."));
        }
        setCredentialsSubmitting(false);
    }

    const telegram = account?.connections?.telegram;
    const vk = account?.connections?.vk;
    /* Показываем заказы выбранной вкладки (как их отдал backend). */
    const tabOrders = orders.filter((order) => orderTab(order) === ordersTab);

    return (
        <AppShell active="account" title={t("Личный кабинет")} contentClassName="account-page">
            {loading ? (
                <Panel className="account-message">{t("Загрузка аккаунта…")}</Panel>
            ) : account ? (
                <>
                    {/* Надписи в первой строке, секции во второй: заказы, рефералы, способы входа. */}
                    <section className="account-layout">
                        <p className="account-description account-orders-caption">
                            {t("Панель заказов")}
                        </p>
                        <p className="account-description account-connections-caption">
                            {t("Способы входа в ваш аккаунт и связанные аккаунты.")}
                        </p>

                        <div className="account-orders">
                            <div className="account-orders-tabs" role="tablist">
                                {ORDER_TABS.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={ordersTab === tab.key}
                                        className={ordersTab === tab.key ? "is-active" : ""}
                                        onClick={() => setOrdersTab(tab.key)}
                                    >
                                        {t(tab.label)}
                                    </button>
                                ))}
                            </div>

                            <div className="account-orders-list">
                                {ordersLoading ? (
                                    <p className="account-orders-note">{t("Загружаем заказы…")}</p>
                                ) : tabOrders.length === 0 ? (
                                    <p className="account-orders-note">{t("Заказов нет.")}</p>
                                ) : (
                                    tabOrders.map((order) => (
                                        <article className="account-order" key={order.id}>
                                            <div className="account-order-primary">
                                                <small>
                                                    {t("Заказ №")}{order.id} · {t(displayPlatform(order.platform))}
                                                </small>
                                                <strong>{Number(order.quantity).toLocaleString("ru-RU")} шт.</strong>
                                            </div>
                                            <span className="account-order-amount">
                                                {formatMoney(order.amount)} ₽
                                            </span>
                                            <OrderStatusBadge status={order.display_status || order.status}>
                                                {order.display_status || order.status}
                                            </OrderStatusBadge>
                                        </article>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="account-referrals">
                            <span className="account-referrals-label">{t("Рефералов")}</span>
                            <span className="account-referrals-value">
                                {referrals ? Number(referrals.count).toLocaleString("ru-RU") : "—"}
                            </span>
                        </div>

                    <div className="account-connections" aria-label={t("Способы входа")}>
                        <div className="account-social-row">
                            <ConnectionCard
                                icon={telegramIcon}
                                actions={
                                    telegram?.connected ? (
                                        <button
                                            className="kp-button kp-button--form kp-button--small"
                                            type="button"
                                            onClick={() => handleDisconnect("telegram")}
                                        >
                                            {t("Отключить")}
                                        </button>
                                    ) : (
                                        <button
                                            className="kp-button kp-button--form kp-button--small"
                                            type="button"
                                            disabled={connecting === "telegram"}
                                            onClick={handleConnectTelegram}
                                        >
                                            {connecting === "telegram" ? t("Подключается…") : t("Подключить")}
                                        </button>
                                    )
                                }
                            />


                            <ConnectionCard
                                icon={vkIcon}
                                actions={
                                    vk?.connected ? (
                                        <button
                                            className="kp-button kp-button--form kp-button--small"
                                            type="button"
                                            onClick={() => handleDisconnect("vk")}
                                        >
                                            {t("Отключить")}
                                        </button>
                                    ) : (
                                        <button
                                            className="kp-button kp-button--form kp-button--small"
                                            type="button"
                                            disabled={connecting === "vk"}
                                            onClick={handleConnectVk}
                                        >
                                            {connecting === "vk" ? t("Подключается…") : t("Подключить")}
                                        </button>
                                    )
                                }
                            />

                        </div>

                        <ConnectionCard
                            className={account.email ? "account-card--email-on" : "account-card--email-add"}
                            title="Email"
                            status={account.email ? <span className="account-value">{account.email}</span> : null}
                            actions={
                                account.email ? (
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="button"
                                        onClick={() => handleDisconnect("email")}
                                    >
                                        {t("Отключить")}
                                    </button>
                                ) : null
                            }
                        >
                            {account.email ? null : (
                                <form className="account-email-form" onSubmit={handleAddEmail}>
                                    <input
                                        className="kp-field"
                                        type="email"
                                        placeholder="example@gmail.com"
                                        value={emailValue}
                                        disabled={emailSubmitting}
                                        onChange={(event) => setEmailValue(event.target.value)}
                                    />
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="submit"
                                        disabled={emailSubmitting || !emailValue.trim()}
                                    >
                                        {emailSubmitting ? t("Подключаем…") : t("Подключить")}
                                    </button>
                                </form>
                            )}
                        </ConnectionCard>

                        <ConnectionCard
                            className="account-card--login is-open"
                            title="Account"
                            status={account.has_password ? null : <StatusBadge connected={false} />}
                        >
                            {!account.has_password && (
                                <span className="account-hint">
                                    {t("Придумайте логин и пароль, чтобы входить без соцсетей.")}
                                </span>
                            )}

                            <form className="account-credentials-form" onSubmit={handleCredentialsSubmit}>
                                {/* С установленным паролем сначала подтверждаем личность:
                                    до этого логин и пароль менять нельзя. */}
                                {account.has_password && (
                                    <div className="account-verify">
                                        <label className="account-field">
                                            <span>{t("Текущий пароль")}</span>
                                            <input
                                                className="kp-field"
                                                type="password"
                                                autoComplete="current-password"
                                                maxLength={100}
                                                placeholder={t("Введите текущий пароль")}
                                                value={currentPassword}
                                                disabled={credentialsSubmitting || passwordVerified}
                                                onChange={(event) => {
                                                    setCurrentPassword(event.target.value);
                                                    setPasswordVerified(false);
                                                }}
                                            />
                                        </label>

                                        <button
                                            className="kp-button kp-button--form kp-button--small"
                                            type="button"
                                            onClick={handleVerifyPassword}
                                            disabled={
                                                credentialsSubmitting ||
                                                checkingPassword ||
                                                passwordVerified ||
                                                !currentPassword.trim()
                                            }
                                        >
                                            {passwordVerified
                                                ? t("Проверен")
                                                : checkingPassword
                                                    ? t("Проверяем…")
                                                    : t("Проверить")}
                                        </button>
                                    </div>
                                )}

                                {account.has_password && !passwordVerified && (
                                    <p className="account-form-hint">
                                        {t("Введите текущий пароль и нажмите «Проверить» — только после этого можно изменить логин или пароль.")}
                                    </p>
                                )}

                                <label className="account-field">
                                    <span>{t("Логин")}</span>
                                    <input
                                        className="kp-field"
                                        type="text"
                                        autoComplete="username"
                                        maxLength={40}
                                        placeholder={t("Придумайте логин")}
                                        value={credentialsLogin}
                                        disabled={credentialsSubmitting || (account.has_password && !passwordVerified)}
                                        onChange={(event) => setCredentialsLogin(event.target.value)}
                                    />
                                </label>

                                <label className="account-field">
                                    <span>{account.has_password ? t("Новый пароль") : t("Пароль")}</span>
                                    <input
                                        className="kp-field"
                                        type="password"
                                        autoComplete="new-password"
                                        maxLength={100}
                                        placeholder={
                                            account.has_password
                                                ? t("Оставьте пустым, чтобы не менять")
                                                : t("Придумайте пароль")
                                        }
                                        value={credentialsPassword}
                                        disabled={credentialsSubmitting || (account.has_password && !passwordVerified)}
                                        onChange={(event) => setCredentialsPassword(event.target.value)}
                                    />
                                </label>

                                <div className="account-credentials-actions">
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="submit"
                                        disabled={
                                            credentialsSubmitting ||
                                            !credentialsLogin.trim() ||
                                            (account.has_password && !passwordVerified)
                                        }
                                    >
                                        {credentialsSubmitting ? t("Сохраняем…") : t("Сохранить")}
                                    </button>
                                </div>
                            </form>
                        </ConnectionCard>
                    </div>
                </section>
                </>
            ) : null}
        </AppShell>
    );
}
