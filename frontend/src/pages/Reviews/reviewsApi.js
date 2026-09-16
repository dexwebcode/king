import { sendRequest } from "../Landing/components/Hero/auth/authApi";

async function request(path, method = "GET", body = null, authenticated = false, signal) {
    const result = await sendRequest(`/api/reviews${path}`, method, body, authenticated, { signal });
    if (!result.ok) {
        const error = new Error("Не удалось выполнить запрос отзывов");
        error.status = result.status;
        throw error;
    }
    return result.data;
}

export const getReviews = (sort, offset = 0, signal) => request(`?${new URLSearchParams({ sort, offset, limit: 10 })}`, "GET", null, false, signal);
export const getReviewStats = (signal) => request("/stats", "GET", null, false, signal);
export const getMyReview = (signal) => request("/me", "GET", null, true, signal);
export const saveReview = (data, editing) => request(editing ? "/me" : "", editing ? "PUT" : "POST", data, true);
