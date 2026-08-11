import { platforms } from "../../landingData";
import { ImagePlaceholder } from "../../shared";
import "./Hero.css";
import "./Visual.css";
import phone from "../../../../assets/phone.png";
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


                {/* ФОРМА ЗАКАЗА */}
                <div className="hero-order-card glass-card">

                    <div className="order-card-head">
                        <div>
                            <span className="muted">Новый заказ</span>
                            <h3>Создание заказа</h3>
                        </div>

                        <span className="status-dot">●</span>
                    </div>


                    <div className="steps-line">
                        {["Площадка", "Услуга", "Детали", "Оплата"].map(
                            (item, index) => (
                                <div
                                    className={
                                        index === 0
                                            ? "step active"
                                            : "step"
                                    }
                                    key={item}
                                >
                                    <span>{index + 1}</span>
                                    <small>{item}</small>
                                </div>
                            )
                        )}
                    </div>


                    <div className="field-block">

                        <label>Выберите площадку</label>

                        <div className="platform-grid compact">
                            {platforms.map((name) => (
                                <button
                                    className="platform-choice"
                                    key={name}
                                >
                                    <ImagePlaceholder label="" />
                                    <span>{name}</span>
                                </button>
                            ))}
                        </div>

                    </div>


                    <div className="field-block">

                        <label>Популярные услуги</label>

                        <div className="service-pills">

                            <button>
                                Подписчики
                                <small>от 0.45 ₽</small>
                            </button>

                            <button>
                                Просмотры
                                <small>от 0.20 ₽</small>
                            </button>

                            <button>
                                Лайки
                                <small>от 0.35 ₽</small>
                            </button>

                        </div>

                    </div>


                    <div className="order-card-footer">

                        <span>
                            Итого: <strong>0 ₽</strong>
                        </span>

                        <button className="button button-gold">
                            Оформить заказ
                        </button>

                    </div>

                </div>

            </div>


            {/* ПРАВАЯ ЧАСТЬ — ТЕЛЕФОН */}
            <div className="hero-visual">

                <img
                    className="phone"
                    src={phone}
                    alt="phone"
                />

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