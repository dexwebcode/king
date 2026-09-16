import { useDeferredValue, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import instagramIcon from "../../assets/social_icons/instagram.svg";
import telegramIcon from "../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../assets/social_icons/tiktok.svg";
import twitchIcon from "../../assets/social_icons/twich.png";
import vkIcon from "../../assets/social_icons/vk.svg";
import vkMusicIcon from "../../assets/social_icons/vk-music.svg";
import youtubeIcon from "../../assets/social_icons/youtube.svg";
import dzenIcon from "../../assets/social_icons/dzen.svg";
import maxIcon from "../../assets/social_icons/max.svg";
import rutubeIcon from "../../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import spotifyIcon from "../../assets/social_icons/Spotify.png";
import appleMusicIcon from "../../assets/social_icons/Apple_Musikl.png";
import HeroRegisterForm from "../Landing/components/Hero/HeroRegisterForm";
import { AUTH_CHANGED_EVENT, logoutUser } from "../Landing/components/Hero/auth/authApi";
import { AccountMenu, InternalHeader } from "../../ui/AppShell";
import "../Landing/Landing.css";
import "./Catalog.css";

const API_URL = import.meta.env.VITE_API_URL || "";

const platformNames = {
    instagram: "Instagram",
    telegram: "Telegram",
    tiktok: "TikTok",
    twitch: "Twitch",
    vk: "VK",
    vk_music: "VK Музыка",
    youtube: "YouTube",
    dzen: "Дзен",
    max: "MAX",
    rutube: "RuTube",
    spotify: "Spotify",
    apple_music: "Apple Music",
    shazam: "Shazam",
};

const platformIcons = {
    instagram: instagramIcon,
    telegram: telegramIcon,
    tiktok: tiktokIcon,
    twitch: twitchIcon,
    vk: vkIcon,
    vk_music: vkMusicIcon,
    youtube: youtubeIcon,
    dzen: dzenIcon,
    max: maxIcon,
    rutube: rutubeIcon,
    spotify: spotifyIcon,
    apple_music: appleMusicIcon,
};

const catalogPlatformOrder = [
    "all",
    "instagram",
    "telegram",
    "tiktok",
    "twitch",
    "vk",
    "vk_music",
    "youtube",
    "rutube",
    "dzen",
    "max",
    "spotify",
    "apple_music",
    "shazam",
];

const serviceTypeNames = {
    followers: "Подписчики",
    likes: "Лайки",
    views: "Просмотры",
    comments: "Комментарии",
    reposts: "Репосты",
    reactions: "Реакции",
    stories: "Истории",
    auto: "Автоуслуги",
    statistics: "Статистика",
    saves: "Сохранения",
    polls: "Опросы",
    friends: "Друзья",
    livestream: "Прямой эфир",
    premium: "Telegram Premium / Stars",
    referrals: "Рефералы",
    listenings: "Прослушивания",
    podcasts: "Подкасты",
};

function displayPlatform(value) {
    const key = String(value || "").toLowerCase();
    return platformNames[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function displayMoney(value) {
    const amount = Number(value);

    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
}

function serviceRate(item) {
    return Number(item.price_per_1000 ?? item.rate ?? 0);
}

function displayServiceType(value) {
    const key = String(value || "").toLowerCase();

    if (key.includes("мгнов")) return "Мгновенные";
    if (key.includes("быстр")) return "Быстрые";
    if (key.includes("медлен")) return "Медленные";

    return serviceTypeNames[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function cleanServiceName(value) {
    return String(value || "Услуга продвижения")
        .replace(/\s*[-–—]\s*(?=[^\n]*(?:обычн|быстр|мгнов|медлен|турбо|[\u26A1\u2B50\u2605]))[^\n]*$/giu, "")
        .replace(/[\u26A1\u2B50\u2605\uFE0F]+/g, " ")
        .replace(/\s*[-–—]?\s*(обычн[а-яё]*|быстр[а-яё]*|мгнов[а-яё]*|медлен[а-яё]*|турбо)\s*$/giu, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function serviceCategory(item) {
    return String(item.service_type || item.type || "").toLowerCase();
}

function matchesServiceType(item, selectedType) {
    return serviceCategory(item) === selectedType;
}

export default function Catalog() {
    const navigate = useNavigate();
    const hasSession = Boolean(localStorage.getItem("token"));
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("loading");
    const [search, setSearch] = useState("");
    const [platform, setPlatform] = useState(
        () => new URLSearchParams(window.location.search).get("platform") || "all"
    );
    const [serviceType, setServiceType] = useState("all");
    const [account, setAccount] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
    const deferredSearch = useDeferredValue(search.trim().toLowerCase());

    useLayoutEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        async function loadCatalog() {
            try {
                const response = await fetch(`${API_URL}/price`, {
                    signal: controller.signal,
                });
                const data = await response.json();

                if (!response.ok || !data?.success || !Array.isArray(data.items)) {
                    throw new Error("Не удалось загрузить каталог");
                }

                setItems(data.items);
                setStatus("ready");
            } catch (error) {
                if (error.name !== "AbortError") {
                    setStatus("error");
                }
            }
        }

        loadCatalog();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!hasSession) {
            return undefined;
        }

        const controller = new AbortController();
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

        async function loadAccountMenu() {
            try {
                const [accountResponse, adminResponse] = await Promise.all([
                    fetch(`${API_URL}/api/me`, { headers, signal: controller.signal }),
                    fetch(`${API_URL}/api/admin/me`, { headers, signal: controller.signal }),
                ]);

                if (accountResponse.ok) setAccount(await accountResponse.json());
                setIsAdmin(adminResponse.ok);
            } catch (error) {
                if (error.name !== "AbortError") {
                    setAccount(null);
                    setIsAdmin(false);
                }
            }
        }

        loadAccountMenu();
        return () => controller.abort();
    }, [hasSession]);

    useEffect(() => {
        function closeAuthPrompt() {
            setIsAuthPromptOpen(false);
        }

        window.addEventListener(AUTH_CHANGED_EVENT, closeAuthPrompt);
        return () => window.removeEventListener(AUTH_CHANGED_EVENT, closeAuthPrompt);
    }, []);

    const availablePlatformSet = new Set(
        items.map((item) => String(item.platform || item.soc || "").toLowerCase()).filter(Boolean)
    );
    const platforms = [
        "all",
        ...catalogPlatformOrder.filter((item) => item !== "all" && availablePlatformSet.has(item)),
        ...[...availablePlatformSet].filter((item) => !catalogPlatformOrder.includes(item)).sort(),
    ];
    const platformItems = platform === "all"
        ? items
        : items.filter((item) => String(item.platform || item.soc || "").toLowerCase() === platform);
    const serviceTypes = [
        "all",
        ...new Set(platformItems.map(serviceCategory).filter(Boolean)),
    ];
    const filteredItems = items
        .filter((item) => {
            const itemPlatform = String(item.platform || item.soc || "").toLowerCase();
            const haystack = `${cleanServiceName(item.name)} ${item.type || ""} ${itemPlatform}`.toLowerCase();

            return (platform === "all" || platform === itemPlatform)
                && (serviceType === "all" || matchesServiceType(item, serviceType))
                && (!deferredSearch || haystack.includes(deferredSearch));
        })
        .sort((left, right) => serviceRate(left) - serviceRate(right));

    function selectPlatform(nextPlatform) {
        setPlatform(nextPlatform);
        setServiceType("all");
    }

    function selectServiceType(nextServiceType) {
        setServiceType(nextServiceType);
    }

    function saveOrderPreset(item) {
        localStorage.setItem("king_order_prefill", JSON.stringify({
            version: 2,
            platform: item.platform || item.soc,
            service_type: item.service_type || item.type,
            service_id: item.provider_service_id ?? item.id ?? item.service,
        }));
    }

    function beginOrder(item) {
        saveOrderPreset(item);
        navigate("/main", { state: { section: "create" } });
    }

    function closeAccountMenu() {
        setIsAccountMenuOpen(false);
    }

    function openAccountMenu() {
        setIsAccountMenuOpen(true);
    }

    function openAuthPrompt() {
        closeAccountMenu();
        setIsAuthPromptOpen(true);
    }

    return (
        <main className="catalog-page">
            <div className="catalog-glow catalog-glow--one" />
            <div className="catalog-glow catalog-glow--two" />
            <InternalHeader
                menuOpen={isAccountMenuOpen}
                onMenuToggle={hasSession ? openAccountMenu : openAuthPrompt}
            />
            <section className={`catalog-controls container ${hasSession ? "is-authenticated" : ""}`} aria-label="Поиск и выбор социальной сети">
                <div className="catalog-section-title" aria-hidden="true">Каталог услуг</div>
                <div className="catalog-socials" aria-label="Выбор социальной сети">
                    {platforms.map((itemPlatform) => {
                        const icon = platformIcons[itemPlatform];
                        const label = itemPlatform === "all" ? "Все соцсети" : displayPlatform(itemPlatform);

                        return (
                            <button
                                key={itemPlatform}
                                type="button"
                                className={platform === itemPlatform ? "active" : ""}
                                onClick={() => selectPlatform(itemPlatform)}
                                aria-label={label}
                                title={label}
                            >
                                {itemPlatform === "all" ? <span>Все</span> : icon ? <img src={icon} alt="" /> : <span>{label.slice(0, 1)}</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="catalog-header-actions">
                    <label className="catalog-search">
                        <span>Поиск по каталогу</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Найти услугу"
                        />
                    </label>
                </div>
            </section>

            <AccountMenu
                open={isAccountMenuOpen}
                onClose={closeAccountMenu}
                active="catalog"
                account={account}
                isAdmin={isAdmin}
                onLogout={() => {
                    logoutUser();
                    navigate("/", { replace: true });
                }}
            />

            {isAuthPromptOpen && (
                <div className="catalog-auth-overlay" role="dialog" aria-modal="true" aria-label="Авторизация">
                    <button className="catalog-auth-overlay-backdrop" type="button" aria-label="Закрыть авторизацию" onClick={() => setIsAuthPromptOpen(false)} />
                    <section className="catalog-auth-card">
                        <button className="catalog-auth-close" type="button" aria-label="Закрыть авторизацию" onClick={() => setIsAuthPromptOpen(false)}>×</button>
                        <HeroRegisterForm />
                    </section>
                </div>
            )}

            <section className="catalog-layout container" aria-label="Услуги">
                <aside className="catalog-service-filters" aria-label="Виды услуг">
                    {serviceTypes.map((itemType) => (
                        <button
                            key={itemType}
                            type="button"
                            className={serviceType === itemType ? "active" : ""}
                            onClick={() => selectServiceType(itemType)}
                        >
                            {itemType === "all" ? "Все услуги" : displayServiceType(itemType)}
                        </button>
                    ))}
                </aside>
                <div className="catalog-content">
                    {status === "loading" && <p className="catalog-state">Загружаем актуальные цены...</p>}
                    {status === "error" && <p className="catalog-state catalog-state--error">Не удалось загрузить каталог. Попробуйте обновить страницу.</p>}
                    {status === "ready" && filteredItems.length === 0 && <p className="catalog-state">По вашему запросу ничего не найдено.</p>}

                    <div className="catalog-grid">
                        {filteredItems.map((item) => {
                            const platformKey = String(item.platform || item.soc || "").toLowerCase();
                            const platformIcon = platformIcons[platformKey];
                            const platformLabel = displayPlatform(platformKey);

                            return (
                                <article className="catalog-card" key={item.id ?? item.service}>
                                    <div className="catalog-card-topline">
                                        <span className="catalog-card-platform" title={platformLabel}>
                                            {platformIcon ? <img src={platformIcon} alt={platformLabel} /> : platformLabel.slice(0, 1)}
                                        </span>
                                        <span className="catalog-card-platform-name">{platformLabel}</span>
                                        <span className="catalog-card-id">#{item.id ?? item.service}</span>
                                    </div>
                                    <h2>{cleanServiceName(item.name)}</h2>
                                    <p className="catalog-type">{displayServiceType(serviceCategory(item))}</p>
                                    <dl>
                                        <div><dt>От</dt><dd>{Number(item.min || 0).toLocaleString("ru-RU")}</dd></div>
                                        <div><dt>До</dt><dd>{Number(item.max || 0).toLocaleString("ru-RU")}</dd></div>
                                    </dl>
                                    <div className="catalog-price">
                                        <span>Цена за 1 000</span>
                                        <strong>{displayMoney(serviceRate(item))} ₽</strong>
                                    </div>
                                    {hasSession ? (
                                        <button className="catalog-order" type="button" onClick={() => beginOrder(item)}>Оформить заказ</button>
                                    ) : (
                                        <button className="catalog-order" type="button" onClick={() => {
                                            saveOrderPreset(item);
                                            openAuthPrompt();
                                        }}>Оформить заказ</button>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>
        </main>
    );
}
