const API_URL = import.meta.env.VITE_API_URL || "";

let prices = null;
let pricesRequest = null;
let accountToken = null;
let account = null;
let accountRequest = null;
let accountVersion = 0;
let pendingBalance = null;
let accountDetails = null;
let accountDetailsRequest = null;
const accountListeners = new Set();
const accountDetailsListeners = new Set();

function notifyAccount() {
    accountListeners.forEach((listener) => listener(account));
}

function notifyAccountDetails() {
    accountDetailsListeners.forEach((listener) => listener(accountDetails));
}

function syncAccountToken(token) {
    if (accountToken === token) return;
    accountToken = token;
    account = null;
    accountRequest = null;
    pendingBalance = null;
    accountDetails = null;
    accountDetailsRequest = null;
    accountVersion += 1;
    notifyAccount();
    notifyAccountDetails();
}

export function getCachedPrices() {
    return prices;
}

export function getPrices() {
    if (prices !== null) return Promise.resolve(prices);
    if (pricesRequest) return pricesRequest;

    const request = fetch(`${API_URL}/price`)
        .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.success || !Array.isArray(data.items)) {
                throw new Error("Не удалось загрузить актуальный каталог");
            }
            prices = data.items;
            return prices;
        })
        .then(
            (items) => { pricesRequest = null; return items; },
            (error) => { pricesRequest = null; throw error; },
        );
    pricesRequest = request;
    return request;
}

export function getCachedAccount() {
    return accountToken === localStorage.getItem("token") ? account : null;
}

export function getAccount() {
    const token = localStorage.getItem("token");
    syncAccountToken(token);
    if (!token) return Promise.reject(new Error("Требуется авторизация"));
    if (account) return Promise.resolve(account);
    if (accountRequest) return accountRequest;

    const version = accountVersion;
    const request = fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
    })
        .then(async (response) => {
            if (!response.ok) throw new Error("Не удалось загрузить баланс");
            return response.json();
        })
        .then(
            (data) => {
                if (accountToken !== token || accountVersion !== version) return null;
                account = pendingBalance === null ? data : { ...data, balance: pendingBalance };
                pendingBalance = null;
                accountRequest = null;
                notifyAccount();
                return account;
            },
            (error) => {
                if (accountToken === token && accountVersion === version) accountRequest = null;
                throw error;
            },
        );
    accountRequest = request;
    return request;
}

/* Принудительно перечитывает аккаунт с сервера, минуя кэш:
   нужен, чтобы баланс в меню совпадал с фактическим. */
export function refreshAccount() {
    account = null;
    accountRequest = null;
    return getAccount();
}

export function updateCachedBalance(balance) {
    const token = localStorage.getItem("token");
    syncAccountToken(token);
    if (!token || balance === null || balance === undefined) return;
    if (!account) {
        pendingBalance = balance;
        return;
    }
    account = { ...account, balance };
    notifyAccount();
}

export function subscribeAccount(listener) {
    accountListeners.add(listener);
    return () => accountListeners.delete(listener);
}

/* --- Данные аккаунта: способы входа, Email, логин --- */

export function getCachedAccountDetails() {
    return accountToken === localStorage.getItem("token") ? accountDetails : null;
}

/* Возвращает кэш, если он уже загружен (повторного запроса не будет). */
export function getAccountDetails() {
    const token = localStorage.getItem("token");
    syncAccountToken(token);
    if (!token) return Promise.reject(new Error("Требуется авторизация"));
    if (accountDetails) return Promise.resolve(accountDetails);
    if (accountDetailsRequest) return accountDetailsRequest;

    const version = accountVersion;
    const request = fetch(`${API_URL}/api/account`, {
        headers: { Authorization: `Bearer ${token}` },
    })
        .then(async (response) => {
            if (!response.ok) throw new Error("Не удалось загрузить аккаунт");
            return response.json();
        })
        .then(
            (data) => {
                if (accountToken !== token || accountVersion !== version) return null;
                accountDetails = data;
                accountDetailsRequest = null;
                notifyAccountDetails();
                return accountDetails;
            },
            (error) => {
                if (accountToken === token && accountVersion === version) accountDetailsRequest = null;
                throw error;
            },
        );
    accountDetailsRequest = request;
    return request;
}

/* Принудительное обновление кэша: после подключения, отключения или смены данных. */
export function refreshAccountDetails() {
    accountDetails = null;
    accountDetailsRequest = null;
    return getAccountDetails();
}

export function subscribeAccountDetails(listener) {
    accountDetailsListeners.add(listener);
    return () => accountDetailsListeners.delete(listener);
}

export function clearAccountCache() {
    accountToken = null;
    account = null;
    accountRequest = null;
    pendingBalance = null;
    accountDetails = null;
    accountDetailsRequest = null;
    accountVersion += 1;
    notifyAccount();
    notifyAccountDetails();
}
