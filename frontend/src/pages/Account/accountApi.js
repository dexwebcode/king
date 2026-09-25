import { sendRequest } from "../Landing/components/Hero/auth/authApi";

/* Чтение аккаунта идёт через общий кэш (ui/dataCache.js), здесь — только изменения. */
export const accountApi = {
    addEmail: (email) => sendRequest("/api/account/email", "POST", { email }, true),
    setCredentials: (payload) =>
        sendRequest("/api/account/credentials", "POST", payload, true),
    verifyPassword: (currentPassword) =>
        sendRequest("/api/account/verify-password", "POST", { current_password: currentPassword }, true),
    disconnect: (provider) =>
        sendRequest(`/api/account/connections/${provider}`, "DELETE", null, true),
};
