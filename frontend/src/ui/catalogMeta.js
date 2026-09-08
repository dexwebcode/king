import instagramIcon from "../assets/social_icons/instagram.svg";
import youtubeIcon from "../assets/social_icons/youtube.svg";
import tiktokIcon from "../assets/social_icons/tiktok.svg";
import telegramIcon from "../assets/social_icons/telegram.svg";
import vkIcon from "../assets/social_icons/vk.svg";
import vkMusicIcon from "../assets/social_icons/vk-music.svg";
import xIcon from "../assets/social_icons/x.svg";
import twitchIcon from "../assets/social_icons/twich.png";
import rutubeIcon from "../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import dzenIcon from "../assets/social_icons/dzen.svg";
import maxIcon from "../assets/social_icons/max.svg";
import spotifyIcon from "../assets/social_icons/Spotify.png";
import appleMusicIcon from "../assets/social_icons/Apple_Musikl.png";


export const platformMeta = {
    instagram: { name: "Instagram", icon: instagramIcon },
    youtube: { name: "YouTube", icon: youtubeIcon },
    tiktok: { name: "TikTok", icon: tiktokIcon },
    telegram: { name: "Telegram", icon: telegramIcon },
    vk: { name: "VK", icon: vkIcon },
    vk_music: { name: "VK Музыка", icon: vkMusicIcon },
    x: { name: "X", icon: xIcon },
    twitch: { name: "Twitch", icon: twitchIcon },
    rutube: { name: "RuTube", icon: rutubeIcon },
    dzen: { name: "Дзен", icon: dzenIcon },
    max: { name: "MAX", icon: maxIcon },
    spotify: { name: "Spotify", icon: spotifyIcon },
    apple_music: { name: "Apple Music", icon: appleMusicIcon },
    apple: { name: "Apple Music", icon: appleMusicIcon },
    shazam: { name: "Shazam", icon: null },
};

export const platformOrder = [
    "instagram", "telegram", "vk", "tiktok", "youtube", "x", "twitch",
    "rutube", "dzen", "max", "spotify", "apple_music", "vk_music",
    "shazam",
];

export const serviceTypeNames = {
    followers: "Подписчики",
    likes: "Лайки",
    views: "Просмотры",
    comments: "Комментарии",
    reactions: "Реакции",
    reposts: "Репосты",
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

export function displayPlatform(value) {
    const key = String(value || "").toLowerCase();
    return platformMeta[key]?.name || key.charAt(0).toUpperCase() + key.slice(1);
}

export function platformIcon(value) {
    return platformMeta[String(value || "").toLowerCase()]?.icon || null;
}

export function displayServiceType(value) {
    const key = String(value || "").toLowerCase();
    return serviceTypeNames[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

export function cleanServiceName(value) {
    return String(value || "Услуга продвижения")
        .replace(/[⚡⭐★️]+/gu, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

export function providerServiceId(item) {
    return String(item?.provider_service_id ?? item?.id ?? item?.service ?? "");
}

export function itemServiceType(item) {
    return String(item?.service_type || item?.type || "").toLowerCase();
}

export function serviceRate(item) {
    const value = Number(item?.price_per_1000 ?? item?.rate ?? 0);
    return Number.isFinite(value) ? value : 0;
}

export function compareServiceRate(item) {
    const value = Number(item?.compare_price_per_1000 ?? item?.compare_rate);
    return Number.isFinite(value) ? value : serviceRate(item);
}

export function formatMoney(value) {
    const amount = Number(value);
    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
}
