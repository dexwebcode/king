import instagramIcon from "../../assets/social_icons/instagram.svg";
import telegramIcon from "../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../assets/social_icons/tiktok.svg";
import vkIcon from "../../assets/social_icons/vk.svg";
import xIcon from "../../assets/social_icons/x.svg";
import youtubeIcon from "../../assets/social_icons/youtube.svg";

const socialIcons = [
    { aliases: ["instagram"], icon: instagramIcon },
    { aliases: ["telegram"], icon: telegramIcon },
    { aliases: ["tiktok", "tik tok"], icon: tiktokIcon },
    { aliases: ["vk", "вк"], icon: vkIcon },
    { aliases: ["twitter", "x"], icon: xIcon },
    { aliases: ["youtube", "you tube"], icon: youtubeIcon },
];

export function getSocialIconByName(name) {
    const normalizedName = name.toLowerCase();

    return socialIcons.find(({ aliases }) =>
        aliases.some((alias) => normalizedName.includes(alias))
    )?.icon;
}

export function ImagePlaceholder({ className = '', label = 'IMG', icon, alt = '' }) {
    return (
        <div className={`image-placeholder ${icon ? 'image-placeholder--filled' : ''} ${className}`}>
            {icon ? <img src={icon} alt={alt} /> : label}
        </div>
    );
}

export function SectionTitle({ title, subtitle }) {
    return (
        <div className="section-heading">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
        </div>
    );
}
