import { useDeferredValue, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../ui/i18n";

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
import shazamIcon from "../../assets/social_icons/shazam.png";
import subscribeIcon from "../../assets/icons/subscribe.svg";
import likesIcon from "../../assets/icons/likes.svg";
import viewsIcon from "../../assets/icons/show.svg";
import commentsIcon from "../../assets/icons/comments.svg";
import repostIcon from "../../assets/icons/repost.svg";
import historyIcon from "../../assets/icons/history.svg";
import statsIcon from "../../assets/icons/stats.svg";
import saveIcon from "../../assets/icons/save.svg";
import pollsIcon from "../../assets/icons/opros.svg";
import friendsIcon from "../../assets/icons/friends.svg";
import translationIcon from "../../assets/icons/translation.svg";
import listeningIcon from "../../assets/icons/listening.svg";
import podcastsIcon from "../../assets/icons/podcasts.svg";
import HeroRegisterForm from "../Landing/components/Hero/HeroRegisterForm";
import { AUTH_CHANGED_EVENT, logoutUser } from "../Landing/components/Hero/auth/authApi";
import { AccountMenu, InternalHeader, MenuToggle } from "../../ui/AppShell";
import { getAccount, getCachedAccount, getCachedPrices, getPrices, subscribeAccount } from "../../ui/dataCache";
import CatalogSearch from "./CatalogSearch";
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
    shazam: shazamIcon,
};

const catalogPlatformOrder = [
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

/* Иконки видов услуг — для плиток-прямоугольников в фильтре слева. */
const serviceTypeIcons = {
    followers: subscribeIcon,
    likes: likesIcon,
    views: viewsIcon,
    comments: commentsIcon,
    reposts: repostIcon,
    stories: historyIcon,
    statistics: statsIcon,
    saves: saveIcon,
    polls: pollsIcon,
    friends: friendsIcon,
    livestream: translationIcon,
    listenings: listeningIcon,
    podcasts: podcastsIcon,
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

/* Одна подпись дублирует другую, если совпадает целиком или входит в неё
   («Просмотры» под «Просмотры TikTok»). */
function isDuplicateLabel(first, second) {
    const left = String(first || "").trim().toLowerCase();
    const right = String(second || "").trim().toLowerCase();

    if (!left || !right) return false;

    return left.includes(right) || right.includes(left);
}

/* Вариант/скорость услуги — хвост названия после «-»:
   «Лайки - Быстрые ⚡️⚡️» → «Быстрые», «Лайки - Турбо ⚡️ ♻ ★» → «Турбо». */
function serviceSpeedLabel(value) {
    const name = String(value || "")
        .replace(/[\u26A1\u2B50\u2605\uFE0F\uFE0E\u267B\u2699]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    const parts = name.split(/\s[-–—]\s*/);

    return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

function serviceCategory(item) {
    return String(item.service_type || item.type || "").toLowerCase();
}

function matchesServiceType(item, selectedType) {
    return serviceCategory(item) === selectedType;
}

export default function Catalog() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const hasSession = Boolean(localStorage.getItem("token"));
    const [items, setItems] = useState(() => getCachedPrices() || []);
    const [status, setStatus] = useState(() => getCachedPrices() ? "ready" : "loading");
    const [search, setSearch] = useState("");
    const [platform, setPlatform] = useState(() => {
        const requestedPlatform = new URLSearchParams(window.location.search)
            .get("platform")
            ?.toLowerCase();
        return requestedPlatform && requestedPlatform !== "all" ? requestedPlatform : null;
    });
    const [serviceType, setServiceType] = useState("all");
    const [account, setAccount] = useState(getCachedAccount);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
    const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
    const deferredSearch = useDeferredValue(search.trim().toLowerCase());

    useLayoutEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, []);

    useEffect(() => {
        let active = true;

        async function loadCatalog() {
            try {
                const priceItems = await getPrices();
                if (active) {
                    setItems(priceItems);
                    setStatus("ready");
                }
            } catch (error) {
                if (active) setStatus("error");
            }
        }

        loadCatalog();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!hasSession) {
            return undefined;
        }

        let active = true;
        const controller = new AbortController();
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const unsubscribe = subscribeAccount((nextAccount) => {
            if (active) setAccount(nextAccount);
        });

        getAccount()
            .then((data) => { if (active) setAccount(data); })
            .catch(() => { if (active) setAccount(null); });
        fetch(`${API_URL}/api/admin/me`, { headers, signal: controller.signal })
            .then((response) => { if (active) setIsAdmin(response.ok); })
            .catch(() => { if (active) setIsAdmin(false); });
        return () => { active = false; controller.abort(); unsubscribe(); };
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
        ...catalogPlatformOrder.filter((item) => availablePlatformSet.has(item)),
        ...[...availablePlatformSet].filter((item) => !catalogPlatformOrder.includes(item)).sort(),
    ];
    const platformItems = platform
        ? items.filter((item) => String(item.platform || item.soc || "").toLowerCase() === platform)
        : items;
    const serviceTypes = [
        "all",
        ...new Set(platformItems.map(serviceCategory).filter(Boolean)),
    ];
    const filteredItems = items
        .filter((item) => {
            const itemPlatform = String(item.platform || item.soc || "").toLowerCase();
            const itemType = serviceCategory(item);
            const haystack = [
                cleanServiceName(item.name),
                item.name,
                item.type,
                item.service_type,
                item.description,
                itemPlatform,
                displayPlatform(itemPlatform),
                displayServiceType(itemType),
            ].filter(Boolean).join(" ").toLowerCase();

            return (!platform || platform === itemPlatform)
                && (serviceType === "all" || matchesServiceType(item, serviceType))
                && (!deferredSearch || haystack.includes(deferredSearch));
        })
        .sort((left, right) => serviceRate(left) - serviceRate(right));

    function selectPlatform(nextPlatform) {
        setPlatform((currentPlatform) => currentPlatform === nextPlatform ? null : nextPlatform);
        setServiceType("all");
        setIsPlatformMenuOpen(false);
    }

    function selectServiceType(nextServiceType) {
        setServiceType(nextServiceType);
    }

    function closeAccountMenu() {
        setIsAccountMenuOpen(false);
    }

    function openAuthPrompt() {
        closeAccountMenu();
        setIsAuthPromptOpen(true);
    }

    function saveOrderPreset(item) {
        localStorage.setItem("king_order_prefill", JSON.stringify({
            version: 2,
            platform: item.platform || item.soc,
            service_type: item.service_type || item.type,
            service_id: item.provider_service_id ?? item.id ?? item.service,
        }));
    }

    /* Клик по карточке: запоминаем услугу и открываем оформление.
       Без входа — сначала предлагаем авторизоваться. */
    function beginOrder(item) {
        saveOrderPreset(item);

        if (!hasSession) {
            openAuthPrompt();
            return;
        }

        navigate("/main", { state: { section: "create" } });
    }

    return (
        <main className="catalog-page">
            {hasSession ? (
                null
            ) : (
                <InternalHeader
                    menuOpen={isAccountMenuOpen}
                    onLogin={openAuthPrompt}
                />
            )}
            <section className={`catalog-controls container ${hasSession ? "is-authenticated" : ""}`} aria-label={t("Поиск и выбор социальной сети")}>
                <div className="catalog-title-row">
                    {hasSession && (
                        <MenuToggle
                            menuOpen={isAccountMenuOpen}
                            onMenuToggle={() => setIsAccountMenuOpen((value) => !value)}
                            className="catalog-menu-toggle"
                        />
                    )}
                    <div className="catalog-section-title" aria-hidden="true">{t("Каталог услуг")}</div>
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
                </div>
                <div className="catalog-filter-bar">
                    <div className="catalog-filter-group">
                        <div className="catalog-socials" aria-label={t("Выбор социальной сети")}>
                            {platforms.map((itemPlatform) => {
                                const icon = platformIcons[itemPlatform];
                                const label = displayPlatform(itemPlatform);

                                return (
                                    <button
                                        key={itemPlatform}
                                        type="button"
                                        className={platform === itemPlatform ? "active" : ""}
                                        onClick={() => selectPlatform(itemPlatform)}
                                        aria-label={`${t(label)}${platform === itemPlatform ? t(", сбросить фильтр") : ""}`}
                                        aria-pressed={platform === itemPlatform}
                                        title={t(label)}
                                    >
                                        {icon ? <img src={icon} alt="" /> : <span>{t(label.slice(0, 1))}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className={`catalog-social-picker ${isPlatformMenuOpen ? "is-open" : ""}`}>
                            <button
                                className="catalog-social-picker-trigger"
                                type="button"
                                aria-expanded={isPlatformMenuOpen}
                                aria-haspopup="listbox"
                                onClick={() => setIsPlatformMenuOpen((value) => !value)}
                            >
                                <span>{platform ? t(displayPlatform(platform)) : t("Выберите соцсеть")}</span>
                                <span className="catalog-social-picker-arrow" aria-hidden="true">⌄</span>
                            </button>
                            <div className="catalog-social-picker-list" role="listbox" aria-label={t("Выбор социальной сети")}>
                                {platforms.map((itemPlatform) => {
                                    const icon = platformIcons[itemPlatform];
                                    const label = displayPlatform(itemPlatform);
                                    const selected = platform === itemPlatform;

                                    return (
                                        <button
                                            key={itemPlatform}
                                            className={selected ? "active" : ""}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            onClick={() => selectPlatform(itemPlatform)}
                                        >
                                            {icon ? <img src={icon} alt="" /> : <span className="catalog-social-picker-fallback">{t(label.slice(0, 1))}</span>}
                                            <span>{t(label)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <CatalogSearch value={search} onChange={setSearch} staticSearch={hasSession} />
                </div>
            </section>

            {isAuthPromptOpen && (
                <div className="catalog-auth-overlay" role="dialog" aria-modal="true" aria-label={t("Авторизация")}>
                    <button className="catalog-auth-overlay-backdrop" type="button" aria-label={t("Закрыть авторизацию")} onClick={() => setIsAuthPromptOpen(false)} />
                    <section className="catalog-auth-card">
                        <button className="catalog-auth-close" type="button" aria-label={t("Закрыть авторизацию")} onClick={() => setIsAuthPromptOpen(false)}>×</button>
                        <HeroRegisterForm />
                    </section>
                </div>
            )}

            <section className="catalog-layout container" aria-label={t("Услуги")}>
                <aside className="catalog-service-filters" aria-label={t("Виды услуг")}>
                    {serviceTypes.map((itemType) => {
                        const icon = serviceTypeIcons[itemType];
                        const label = itemType === "all" ? "Все услуги" : displayServiceType(itemType);

                        return (
                            <button
                                key={itemType}
                                type="button"
                                className={serviceType === itemType ? "active" : ""}
                                onClick={() => selectServiceType(itemType)}
                            >
                                <span className="catalog-service-icon">
                                    {icon ? <img src={icon} alt="" /> : <i>{t(label.slice(0, 1))}</i>}
                                </span>
                                <span className="catalog-service-label">{t(label)}</span>
                            </button>
                        );
                    })}
                </aside>
                <div className="catalog-content">
                    {status === "loading" && <p className="catalog-state">{t("Загружаем актуальные цены...")}</p>}
                    {status === "error" && <p className="catalog-state catalog-state--error">{t("Не удалось загрузить каталог. Попробуйте обновить страницу.")}</p>}
                    {status === "ready" && filteredItems.length === 0 && <p className="catalog-state">{t("По вашему запросу ничего не найдено.")}</p>}

                    <div className="catalog-grid">
                        {filteredItems.map((item) => {
                            const platformKey = String(item.platform || item.soc || "").toLowerCase();
                            const platformIcon = platformIcons[platformKey];
                            const platformLabel = displayPlatform(platformKey);
                            const serviceName = cleanServiceName(item.name);
                            const typeLabel = displayServiceType(serviceCategory(item));
                            /* Под названием показываем скорость/вариант услуги, а если
                               её нет — вид услуги, и только когда он не дублирует название. */
                            const speedLabel = serviceSpeedLabel(item.name);
                            const bottomLabel = speedLabel
                                || (isDuplicateLabel(serviceName, typeLabel) ? "" : typeLabel);

                            return (
                                <article
                                    className="catalog-card"
                                    key={item.id ?? item.service}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={t(serviceName)}
                                    onClick={() => beginOrder(item)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            beginOrder(item);
                                        }
                                    }}
                                >
                                    <div className="catalog-card-topline">
                                        <span className="catalog-card-platform" title={t(platformLabel)}>
                                            {platformIcon ? <img src={platformIcon} alt={t(platformLabel)} /> : t(platformLabel.slice(0, 1))}
                                        </span>
                                        <span className="catalog-card-platform-name">{t(platformLabel)}</span>
                                        <span className="catalog-card-id">#{item.id ?? item.service}</span>
                                    </div>
                                    <h2>{t(serviceName)}</h2>
                                    {bottomLabel && <p className="catalog-type">{t(bottomLabel)}</p>}
                                    <dl>
                                        <div><dt>{t("От")}</dt><dd>{Number(item.min || 0).toLocaleString("ru-RU")}</dd></div>
                                        <div><dt>{t("До")}</dt><dd>{Number(item.max || 0).toLocaleString("ru-RU")}</dd></div>
                                    </dl>
                                    <div className="catalog-price">
                                        <span>{t("Цена за 1 000")}</span>
                                        <strong>{displayMoney(serviceRate(item))} ₽</strong>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>
        </main>
    );
}
