import { useCallback, useEffect, useRef, useState } from "react";
import * as VKID from "@vkid/sdk";

import { AppShell, PageHeader, Panel } from "../../ui/AppShell";
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
import { accountApi } from "./accountApi";
import telegramIcon from "../../assets/social_icons/telegram.svg";
import vkIcon from "../../assets/social_icons/vk.svg";
import "./Account.css";

const VK_APP_ID = 54737931;
const VK_REDIRECT_URL = "https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback";

function ConnectionCard({ icon, title, children, actions, className = "" }) {
    const { t } = useLanguage();
    return (
        <article className={`account-card ${className}`.trim()}>
            <div className="account-card-head">
                {icon && (
                    <span className="account-card-icon">
                        <img src={icon} alt="" aria-hidden="true" />
                    </span>
                )}
                <h2>{t(title)}</h2>
            </div>
            <div className="account-card-body">{children}</div>
            {actions && <div className="account-card-actions">{actions}</div>}
        </article>
    );
}

export default function AccountPage() {
    const { t } = useLanguage();
    const [account, setAccount] = useState(getCachedAccountDetails);
    const [loading, setLoading] = useState(() => !getCachedAccountDetails());
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [connecting, setConnecting] = useState(null);
    const [emailValue, setEmailValue] = useState("");
    const [emailSubmitting, setEmailSubmitting] = useState(false);

    const [credentialsOpen, setCredentialsOpen] = useState(false);
    const [credentialsLogin, setCredentialsLogin] = useState("");
    const [credentialsPassword, setCredentialsPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [credentialsError, setCredentialsError] = useState("");
    const [passwordHint, setPasswordHint] = useState("");
    const [credentialsSubmitting, setCredentialsSubmitting] = useState(false);
    /* Личность подтверждена текущим паролем — только тогда поля открываются. */
    const [passwordVerified, setPasswordVerified] = useState(false);
    const [checkingPassword, setCheckingPassword] = useState(false);

    const pollTimerRef = useRef(null);

    /* Данные аккаунта берём из общего кэша: он прогрет при входе,
       поэтому повторной загрузки при открытии страницы не будет. */
    const load = useCallback(async ({ force = false } = {}) => {
        try {
            const data = force ? await refreshAccountDetails() : await getAccountDetails();
            if (data) setAccount(data);
        } catch (requestError) {
            setError(requestError?.message || t("Не удалось загрузить аккаунт."));
        }
    }, []);

    const reload = useCallback(() => load({ force: true }), [load]);

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

    function pollTelegram(token) {
        stopPolling();
        pollTimerRef.current = window.setInterval(async () => {
            const response = await getTelegramSessionStatus(token);
            if (!response.ok) {
                stopPolling();
                setError(response.data?.detail || t("Ошибка проверки Telegram."));
                setConnecting(null);
                return;
            }
            const status = response.data?.status;
            if (status === "connected") {
                stopPolling();
                setNotice(t("Telegram подключён."));
                setConnecting(null);
                reload();
            } else if (status === "conflict") {
                stopPolling();
                setError(t("Этот Telegram-аккаунт уже связан с другим аккаунтом."));
                setConnecting(null);
            } else if (status === "expired" || status === "not_found") {
                stopPolling();
                setError(t("Сессия подключения истекла. Попробуйте ещё раз."));
                setConnecting(null);
            }
        }, 2500);
    }

    async function handleConnectTelegram() {
        setError("");
        setNotice("");
        setConnecting("telegram");
        const tgWindow = window.open("about:blank", "_blank");
        try {
            const response = await createTelegramSession();
            if (!response.ok || !response.data?.success) {
                tgWindow?.close();
                setError(response.data?.detail || t("Не удалось начать подключение Telegram."));
                setConnecting(null);
                return;
            }
            const { token, bot_url } = response.data;
            if (!token || !bot_url) {
                tgWindow?.close();
                setError(t("Telegram-бот не настроен на backend."));
                setConnecting(null);
                return;
            }
            setNotice(t("Откройте Telegram и нажмите Start."));
            if (tgWindow) {
                tgWindow.opener = null;
                tgWindow.location.href = bot_url;
            } else {
                window.open(bot_url, "_blank", "noopener,noreferrer");
            }
            pollTelegram(token);
        } catch {
            tgWindow?.close();
            setError(t("Не удалось подключиться к серверу."));
            setConnecting(null);
        }
    }

    async function handleConnectVk() {
        setError("");
        setNotice("");
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
                setError(response.data?.detail || t("Не удалось подключить VK."));
                return;
            }
            setNotice(t("VK подключён."));
            reload();
        } catch (vkError) {
            setError(
                vkError?.error_description || vkError?.error || t("VK подключение не завершено.")
            );
        } finally {
            setConnecting(null);
        }
    }

    async function handleDisconnect(provider) {
        setError("");
        setNotice("");
        const response = await accountApi.disconnect(provider);
        if (response.ok) {
            setNotice(provider === "telegram" ? t("Telegram отключён.") : t("VK отключён."));
            reload();
        } else {
            setError(response.data?.detail || t("Не удалось отключить способ входа."));
        }
    }

    async function handleAddEmail(event) {
        event.preventDefault();
        const email = emailValue.trim();
        if (!email) return;
        setEmailSubmitting(true);
        setError("");
        setNotice("");
        const response = await accountApi.addEmail(email);
        if (response.ok) {
            setNotice(t("Email добавлен."));
            setEmailValue("");
            reload();
        } else {
            setError(response.data?.detail || t("Не удалось добавить Email."));
        }
        setEmailSubmitting(false);
    }

    function openCredentials() {
        setCredentialsOpen(true);
        setCredentialsLogin(account?.login || "");
        setCredentialsPassword("");
        setCurrentPassword("");
        setCredentialsError("");
        setPasswordHint("");
        setPasswordVerified(false);
    }

    function closeCredentials() {
        setCredentialsOpen(false);
        setCredentialsPassword("");
        setCurrentPassword("");
        setCredentialsError("");
        setPasswordHint("");
        setPasswordVerified(false);
    }

    async function handleVerifyPassword() {
        const value = currentPassword.trim();
        setCredentialsError("");
        if (!value) {
            setCredentialsError(t("Введите текущий пароль."));
            return;
        }
        setCheckingPassword(true);
        const response = await accountApi.verifyPassword(value);
        if (response.ok) {
            setPasswordVerified(true);
        } else {
            setPasswordVerified(false);
            setCredentialsError(response.data?.detail || t("Неверный пароль."));
        }
        setCheckingPassword(false);
    }

    async function handleCredentialsSubmit(event) {
        event.preventDefault();
        const login = credentialsLogin.trim().toLowerCase();
        setCredentialsError("");
        setPasswordHint("");

        if (login.length < 3 || login.length > 40 || /\s/.test(login)) {
            setCredentialsError(t("Логин: от 3 до 40 символов, без пробелов."));
            return;
        }
        if (!account.has_password && !credentialsPassword) {
            setCredentialsError(t("Придумайте пароль для входа по логину."));
            return;
        }
        if (credentialsPassword) {
            const hint = validatePassword(credentialsPassword);
            if (hint) {
                setPasswordHint(hint);
                return;
            }
        }
        if (account.has_password && !passwordVerified) {
            setCredentialsError(t("Сначала подтвердите текущий пароль кнопкой «Проверить»."));
            return;
        }

        setCredentialsSubmitting(true);
        const response = await accountApi.setCredentials({
            login,
            password: credentialsPassword || null,
            current_password: currentPassword || null,
        });
        if (response.ok) {
            setNotice(t("Логин и пароль сохранены."));
            closeCredentials();
            reload();
        } else {
            setCredentialsError(response.data?.detail || t("Не удалось сохранить логин и пароль."));
        }
        setCredentialsSubmitting(false);
    }

    const telegram = account?.connections?.telegram;
    const vk = account?.connections?.vk;

    return (
        <AppShell active="account" title={t("Личный кабинет")} contentClassName="account-page">
            <PageHeader
                description={t("Способы входа в ваш аккаунт и связанные аккаунты.")}
            />

            {error && <p className="account-alert" role="alert">{t(error)}</p>}
            {notice && <p className="account-notice" role="status">{t(notice)}</p>}

            {loading ? (
                <Panel className="account-message">{t("Загрузка аккаунта…")}</Panel>
            ) : account ? (
                <section className="account-layout">
                    <div className="account-connections" aria-label={t("Способы входа")}>
                        <ConnectionCard title="Email">
                            {account.email ? (
                                <>
                                    <p className="account-status">
                                        <span className="account-username">{account.email}</span>
                                        {account.email_verified ? (
                                            <span className="account-badge account-badge--connected">{t("Подтверждено")}</span>
                                        ) : (
                                            <span className="account-badge account-badge--muted">{t("Не подтверждено")}</span>
                                        )}
                                    </p>
                                    {!account.email_verified && (
                                        <span className="account-tooltip" data-tooltip={t("Функция в разработке")}>
                                            <button
                                                className="kp-button kp-button--form kp-button--small"
                                                type="button"
                                                disabled
                                            >
                                                {t("Подтвердить")}
                                            </button>
                                        </span>
                                    )}
                                </>
                            ) : (
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
                                        {emailSubmitting ? t("Сохраняем…") : t("Добавить Email")}
                                    </button>
                                </form>
                            )}
                        </ConnectionCard>

                        <ConnectionCard
                            icon={telegramIcon}
                            title="Telegram"
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
                        >
                            {telegram?.connected ? (
                                <p className="account-status">
                                    <span className="account-badge account-badge--connected">{t("Подключено")}</span>
                                    {telegram.username && (
                                        <span className="account-username">@{telegram.username}</span>
                                    )}
                                </p>
                            ) : (
                                <p className="account-status">
                                    <span className="account-badge account-badge--muted">{t("Не подключено")}</span>
                                </p>
                            )}
                        </ConnectionCard>

                        <ConnectionCard
                            icon={vkIcon}
                            title="VK"
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
                        >
                            {vk?.connected ? (
                                <p className="account-status">
                                    <span className="account-badge account-badge--connected">{t("Подключено")}</span>
                                    {vk.display_name && <span className="account-username">{vk.display_name}</span>}
                                </p>
                            ) : (
                                <p className="account-status">
                                    <span className="account-badge account-badge--muted">{t("Не подключено")}</span>
                                </p>
                            )}
                        </ConnectionCard>

                        <ConnectionCard
                            className={`account-card--login${!account.has_password || credentialsOpen ? " is-open" : ""}`}
                            title="Логин"
                            actions={
                                account.has_password && !credentialsOpen ? (
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="button"
                                        onClick={openCredentials}
                                    >
                                        {t("Изменить логин и пароль")}
                                    </button>
                                ) : null
                            }
                        >
                            <p className="account-status">
                                {account.has_password ? (
                                    <>
                                        <span className="account-badge account-badge--connected">{t("Подключено")}</span>
                                        {account.login && <span className="account-username">{account.login}</span>}
                                    </>
                                ) : (
                                    <span className="account-badge account-badge--muted">{t("Не подключено")}</span>
                                )}
                            </p>
                            <span className="account-hint">
                                {account.has_password
                                    ? t("Вход по логину и паролю.")
                                    : t("Придумайте логин и пароль, чтобы входить без соцсетей.")}
                            </span>

                            {(!account.has_password || credentialsOpen) && (
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

                                    {passwordHint && <p className="account-form-hint">{t(passwordHint)}</p>}
                                    {credentialsError && (
                                        <p className="account-form-error" role="alert">{t(credentialsError)}</p>
                                    )}

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
                                        {account.has_password && (
                                            <button
                                                className="kp-button kp-button--form kp-button--small"
                                                type="button"
                                                onClick={closeCredentials}
                                                disabled={credentialsSubmitting}
                                            >
                                                {t("Отмена")}
                                            </button>
                                        )}
                                    </div>
                                </form>
                            )}
                        </ConnectionCard>
                    </div>


                </section>
            ) : null}
        </AppShell>
    );
}
