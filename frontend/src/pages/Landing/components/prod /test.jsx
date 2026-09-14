import instagramIcon from "../../../../assets/social_icons/instagram.svg";
import telegramIcon from "../../../../assets/social_icons/telegram.svg";
import tiktokIcon from "../../../../assets/social_icons/tiktok.svg";
import vkIcon from "../../../../assets/social_icons/vk.svg";
import youtubeIcon from "../../../../assets/social_icons/youtube.svg";
import rutubeIcon from "../../../../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import spotifyIcon from "../../../../assets/social_icons/Spotify.png";
import dzenIcon from "../../../../assets/social_icons/dzen.svg";
import maxIcon from "../../../../assets/social_icons/max.svg";
import vkMusicIcon from "../../../../assets/social_icons/vk-music.svg";
import twitchIcon from "../../../../assets/social_icons/twich.png";
import appleMusicIcon from "../../../../assets/social_icons/Apple_Musikl.png";

const heroPlatforms = [
    { name: "Instagram", icon: instagramIcon },
    { name: "Telegram", icon: telegramIcon },
    { name: "TikTok", icon: tiktokIcon },
    { name: "VK", icon: vkIcon },
    { name: "YouTube", icon: youtubeIcon },
    { name: "RuTube", icon: rutubeIcon },
    { name: "Dzen", icon: dzenIcon },
    { name: "MAX", icon: maxIcon },
    { name: "Spotify", icon: spotifyIcon },
    { name: "VK Музыка", icon: vkMusicIcon },
    { name: "Twitch", icon: twitchIcon },
    { name: "Apple Music", icon: appleMusicIcon },
];

<div className="hero-supported-platforms" aria-label="Поддерживаемые площадки">

    <div className="hero-supported-platforms-grid">
        {heroPlatforms.map((platform) => (
            <div className="hero-supported-platform" key={platform.name}>
                <img src={platform.icon} alt={platform.name} />
            </div>
        ))}
    </div>
</div>