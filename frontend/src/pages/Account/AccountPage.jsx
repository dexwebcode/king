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
import { accountApi } from "./accountApi";
import telegramIcon from "../../assets/social_icons/telegram.svg";
import vkIcon from "../../assets/social_icons/vk.svg";
import "./Account.css";

const VK_APP_ID = 54737931;
const VK_REDIRECT_URL = "https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback";

function ConnectionCard({ icon, title, children, actions, className = "" }) {
    return (
        <article className={`account-card ${className}`.trim()}>
            <div className="account-card-head">
                {icon && (
                    <span className="account-card-icon">
                        <img src={icon} alt="" aria-hidden="true" />
                    </span>
                )}
                <h2>{title}</h2>
            </div>
            <div className="account-card-body">{children}</div>
            {actions && <div className="account-card-actions">{actions}</div>}
        </article>
    );
}

export default function AccountPage() {
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
            setError(requestError?.message || "Не удалось загрузить аккаунт.");
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
                setError(response.data?.detail || "Ошибка проверки Telegram.");
                setConnecting(null);
                return;
            }
            const status = response.data?.status;
            if (status === "connected") {
                stopPolling();
                setNotice("Telegram подключён.");
                setConnecting(null);
                reload();
            } else if (status === "conflict") {
                stopPolling();
                setError("Этот Telegram-аккаунт уже связан с другим аккаунтом.");
                setConnecting(null);
            } else if (status === "expired" || status === "not_found") {
                stopPolling();
                setError("Сессия подключения истекла. Попробуйте ещё раз.");
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
                setError(response.data?.detail || "Не удалось начать подключение Telegram.");
                setConnecting(null);
                return;
            }
            const { token, bot_url } = response.data;
            if (!token || !bot_url) {
                tgWindow?.close();
                setError("Telegram-бот не настроен на backend.");
                setConnecting(null);
                return;
            }
            setNotice("Откройте Telegram и нажмите Start.");
            if (tgWindow) {
                tgWindow.opener = null;
                tgWindow.location.href = bot_url;
            } else {
                window.open(bot_url, "_blank", "noopener,noreferrer");
            }
            pollTelegram(token);
        } catch {
            tgWindow?.close();
            setError("Не удалось подключиться к серверу.");
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
                setError(response.data?.detail || "Не удалось подключить VK.");
                return;
            }
            setNotice("VK подключён.");
            reload();
        } catch (vkError) {
            setError(
                vkError?.error_description || vkError?.error || "VK подключение не завершено."
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
            setNotice(provider === "telegram" ? "Telegram отключён." : "VK отключён.");
            reload();
        } else {
            setError(response.data?.detail || "Не удалось отключить способ входа.");
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
            setNotice("Email добавлен.");
            setEmailValue("");
            reload();
        } else {
            setError(response.data?.detail || "Не удалось добавить Email.");
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
            setCredentialsError("Введите текущий пароль.");
            return;
        }
        setCheckingPassword(true);
        const response = await accountApi.verifyPassword(value);
        if (response.ok) {
            setPasswordVerified(true);
        } else {
            setPasswordVerified(false);
            setCredentialsError(response.data?.detail || "Неверный пароль.");
        }
        setCheckingPassword(false);
    }

    async function handleCredentialsSubmit(event) {
        event.preventDefault();
        const login = credentialsLogin.trim().toLowerCase();
        setCredentialsError("");
        setPasswordHint("");

        if (login.length < 3 || login.length > 40 || /\s/.test(login)) {
            setCredentialsError("Логин: от 3 до 40 символов, без пробелов.");
            return;
        }
        if (!account.has_password && !credentialsPassword) {
            setCredentialsError("Придумайте пароль для входа по логину.");
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
            setCredentialsError("Сначала подтвердите текущий пароль кнопкой «Проверить».");
            return;
        }

        setCredentialsSubmitting(true);
        const response = await accountApi.setCredentials({
            login,
            password: credentialsPassword || null,
            current_password: currentPassword || null,
        });
        if (response.ok) {
            setNotice("Логин и пароль сохранены.");
            closeCredentials();
            reload();
        } else {
            setCredentialsError(response.data?.detail || "Не удалось сохранить логин и пароль.");
        }
        setCredentialsSubmitting(false);
    }

    const telegram = account?.connections?.telegram;
    const vk = account?.connections?.vk;

    return (
        <AppShell active="account" title="Личный кабинет" contentClassName="account-page">
            <PageHeader
                description="Способы входа в ваш аккаунт и связанные аккаунты."
            />

            {error && <p className="account-alert" role="alert">{error}</p>}
            {notice && <p className="account-notice" role="status">{notice}</p>}

            {loading ? (
                <Panel className="account-message">Загрузка аккаунта…</Panel>
            ) : account ? (
                <section className="account-layout">
                    <div className="account-connections" aria-label="Способы входа">
                        <ConnectionCard title="Email">
                            {account.email ? (
                                <>
                                    <p className="account-status">
                                        <span className="account-username">{account.email}</span>
                                        {account.email_verified ? (
                                            <span className="account-badge account-badge--connected">Подтверждено</span>
                                        ) : (
                                            <span className="account-badge account-badge--muted">Не подтверждено</span>
                                        )}
                                    </p>
                                    {!account.email_verified && (
                                        <span className="account-tooltip" data-tooltip="Функция в разработке">
                                            <button
                                                className="kp-button kp-button--form kp-button--small"
                                                type="button"
                                                disabled
                                            >
                                                Подтвердить
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
                                        {emailSubmitting ? "Сохраняем…" : "Добавить Email"}
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
                                        Отключить
                                    </button>
                                ) : (
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="button"
                                        disabled={connecting === "telegram"}
                                        onClick={handleConnectTelegram}
                                    >
                                        {connecting === "telegram" ? "Подключается…" : "Подключить"}
                                    </button>
                                )
                            }
                        >
                            {telegram?.connected ? (
                                <p className="account-status">
                                    <span className="account-badge account-badge--connected">Подключено</span>
                                    {telegram.username && (
                                        <span className="account-username">@{telegram.username}</span>
                                    )}
                                </p>
                            ) : (
                                <p className="account-status">
                                    <span className="account-badge account-badge--muted">Не подключено</span>
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
                                        Отключить
                                    </button>
                                ) : (
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="button"
                                        disabled={connecting === "vk"}
                                        onClick={handleConnectVk}
                                    >
                                        {connecting === "vk" ? "Подключается…" : "Подключить"}
                                    </button>
                                )
                            }
                        >
                            {vk?.connected ? (
                                <p className="account-status">
                                    <span className="account-badge account-badge--connected">Подключено</span>
                                    {vk.display_name && <span className="account-username">{vk.display_name}</span>}
                                </p>
                            ) : (
                                <p className="account-status">
                                    <span className="account-badge account-badge--muted">Не подключено</span>
                                </p>
                            )}
                        </ConnectionCard>

                        <ConnectionCard
                            className="account-card--login"
                            title="Логин"
                            actions={
                                account.has_password && !credentialsOpen ? (
                                    <button
                                        className="kp-button kp-button--form kp-button--small"
                                        type="button"
                                        onClick={openCredentials}
                                    >
                                        Изменить логин и пароль
                                    </button>
                                ) : null
                            }
                        >
                            <p className="account-status">
                                {account.has_password ? (
                                    <>
                                        <span className="account-badge account-badge--connected">Подключено</span>
                                        {account.login && <span className="account-username">{account.login}</span>}
                                    </>
                                ) : (
                                    <span className="account-badge account-badge--muted">Не подключено</span>
                                )}
                            </p>
                            <span className="account-hint">
                                {account.has_password
                                    ? "Вход по логину и паролю."
                                    : "Придумайте логин и пароль, чтобы входить без соцсетей."}
                            </span>

                            {(!account.has_password || credentialsOpen) && (
                                <form className="account-credentials-form" onSubmit={handleCredentialsSubmit}>
                                    {/* С установленным паролем сначала подтверждаем личность:
                                        до этого логин и пароль менять нельзя. */}
                                    {account.has_password && (
                                        <div className="account-verify">
                                            <label className="account-field">
                                                <span>Текущий пароль</span>
                                                <input
                                                    className="kp-field"
                                                    type="password"
                                                    autoComplete="current-password"
                                                    maxLength={100}
                                                    placeholder="Введите текущий пароль"
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
                                                    ? "Проверен"
                                                    : checkingPassword
                                                        ? "Проверяем…"
                                                        : "Проверить"}
                                            </button>
                                        </div>
                                    )}

                                    {account.has_password && !passwordVerified && (
                                        <p className="account-form-hint">
                                            Введите текущий пароль и нажмите «Проверить» — только после этого можно изменить логин или пароль.
                                        </p>
                                    )}

                                    <label className="account-field">
                                        <span>Логин</span>
                                        <input
                                            className="kp-field"
                                            type="text"
                                            autoComplete="username"
                                            maxLength={40}
                                            placeholder="Придумайте логин"
                                            value={credentialsLogin}
                                            disabled={credentialsSubmitting || (account.has_password && !passwordVerified)}
                                            onChange={(event) => setCredentialsLogin(event.target.value)}
                                        />
                                    </label>

                                    <label className="account-field">
                                        <span>{account.has_password ? "Новый пароль" : "Пароль"}</span>
                                        <input
                                            className="kp-field"
                                            type="password"
                                            autoComplete="new-password"
                                            maxLength={100}
                                            placeholder={
                                                account.has_password
                                                    ? "Оставьте пустым, чтобы не менять"
                                                    : "Придумайте пароль"
                                            }
                                            value={credentialsPassword}
                                            disabled={credentialsSubmitting || (account.has_password && !passwordVerified)}
                                            onChange={(event) => setCredentialsPassword(event.target.value)}
                                        />
                                    </label>

                                    {passwordHint && <p className="account-form-hint">{passwordHint}</p>}
                                    {credentialsError && (
                                        <p className="account-form-error" role="alert">{credentialsError}</p>
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
                                            {credentialsSubmitting ? "Сохраняем…" : "Сохранить"}
                                        </button>
                                        {account.has_password && (
                                            <button
                                                className="kp-button kp-button--form kp-button--small"
                                                type="button"
                                                onClick={closeCredentials}
                                                disabled={credentialsSubmitting}
                                            >
                                                Отмена
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
