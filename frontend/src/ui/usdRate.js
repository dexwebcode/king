import { useEffect, useState } from "react";

const STORAGE_KEY = "kp_usd_rate";
const TTL_MS = 60 * 60 * 1000; // кэш на 1 час
/* Открытый API без ключа: курс RUB -> USD (поле rates.USD — сколько USD за 1 RUB). */
const RATE_API = "https://open.er-api.com/v6/latest/RUB";

function readCachedRate() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        const rate = Number(parsed?.rate);
        if (!Number.isFinite(rate) || rate <= 0) return null;
        if (Date.now() - Number(parsed?.at || 0) > TTL_MS) return null;

        return rate;
    } catch {
        return null;
    }
}

/* Хук возвращает курс RUB -> USD (число) или null, пока курс не загружен. */
export function useUsdRate() {
    const [rate, setRate] = useState(readCachedRate);

    useEffect(() => {
        if (readCachedRate() != null) return undefined;

        let active = true;

        fetch(RATE_API)
            .then((response) => response.json())
            .then((data) => {
                const next = Number(data?.rates?.USD);
                if (active && Number.isFinite(next) && next > 0) {
                    localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify({ rate: next, at: Date.now() }),
                    );
                    setRate(next);
                }
            })
            .catch(() => {});

        return () => {
            active = false;
        };
    }, []);

    return rate;
}

/* Конвертирует рубли в доллары и форматирует как USD-строку ($1,234.56).
   Возвращает null, если курс недоступен. */
export function formatUsd(rubles, rate) {
    const usd = Number(rubles) * Number(rate);
    if (!Number.isFinite(usd)) return null;

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(usd);
}
