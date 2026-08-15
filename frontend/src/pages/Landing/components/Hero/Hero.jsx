import OrderCard from "../OrderCard/OrderCard";
import "./Hero.css";
import "./Visual.css";
import tiktok from "../../../../assets/tiktok.png";
import vk from "../../../../assets/vk.png";
import telegram from "../../../../assets/telegram.png";
import x from "../../../../assets/x.png";
import insta from "../../../../assets/insta.png";
import youtube from "../../../../assets/youtube.png";
export default function Hero() {
    return (
        <section className="hero container">

            {/* ЛЕВАЯ ЧАСТЬ */}
            <div className="hero-content">

                {/* Заголовок */}
                <div className="hero-copy">
                    <div className="eyebrow">
                        Продвижение в социальных сетях
                    </div>

                    <h1>
                        KING
                        <span>PROMOTION</span>
                    </h1>

                    <p className="hero-subtitle">
                        Продвигайте аккаунты быстрее без сложных настроек.
                        Тысячи клиентов уже получают подписчиков,
                        просмотры и активность с нами.
                    </p>
                </div>


            </div>


            {/* ПРАВАЯ ЧАСТЬ — КАРТОЧКА И СОЦСЕТИ */}
            <div className="hero-visual">

                <div className="hero-order-card">
                    <OrderCard />
                </div>

                <img
                    className="social-icon insta"
                    src={insta}
                    alt="Instagram"
                />

                <img
                    className="social-icon x"
                    src={x}
                    alt="X"
                />

                <img
                    className="social-icon vk"
                    src={vk}
                    alt="VK"
                />

                <img
                    className="social-icon telegram"
                    src={telegram}
                    alt="Telegram"
                />

                <img
                    className="social-icon tiktok"
                    src={tiktok}
                    alt="TikTok"
                />

                <img
                    className="social-icon youtube"
                    src={youtube}
                    alt="YouTube"
                />

            </div>

        </section>
    );
}
