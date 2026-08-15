import { useEffect, useRef, useState } from "react";
import "./OrderCard.css";
import youtube from "../../../../assets/social_icons/youtube.svg";
import telegram from "../../../../assets/social_icons/telegram.svg";
import tiktok from "../../../../assets/social_icons/tiktok.svg";
import instagram from "../../../../assets/social_icons/instagram.svg";
import vk from "../../../../assets/social_icons/vk.svg";
import twitter_x from "../../../../assets/social_icons/x.svg";

const platforms = [
  { id: "instagram", name: "Instagram", icon: instagram, className: "instagram" },
  { id: "youtube", name: "YouTube", icon: youtube, className: "youtube" },
  { id: "tiktok", name: "TikTok", icon: tiktok, className: "tiktok" },
  { id: "telegram", name: "Telegram", icon: telegram, className: "telegram" },
  { id: "vk", name: "VK", icon: vk, className: "vk" },
  { id: "twitter", name: "Twitter (X)", icon: twitter_x, className: "twitter" },
];

const speeds = [
  {
    id: "standard",
    icon: "ϟ",
    title: "Стандарт",
    description: "1–2 дня",
  },
  {
    id: "fast",
    icon: "🚀",
    title: "Ускоренная",
    description: "До 12 часов",
  },
  {
    id: "lightning",
    icon: "♛",
    title: "Молниеносная",
    description: "До 2 часов",
  },
];

export default function OrderCard({ isGuidePinned = false, onGuidePanelHover }) {
  const [platform, setPlatform] = useState("instagram");
  const [service, setService] = useState("Подписчики");
  const [quantity, setQuantity] = useState(1000);
  const [speed, setSpeed] = useState("fast");
  const [isHoverReady, setIsHoverReady] = useState(false);
  const hoverDelayTimer = useRef(null);

  const currentPlatform =
    platforms.find((item) => item.id === platform) || platforms[0];

  const currentSpeed =
    speeds.find((item) => item.id === speed) || speeds[1];

  const decreaseQuantity = () => {
    setQuantity((prev) => Math.max(100, prev - 100));
  };

  const increaseQuantity = () => {
    setQuantity((prev) => prev + 100);
  };

  const formattedQuantity = quantity.toLocaleString("ru-RU");

  const clearHoverDelay = () => {
    if (hoverDelayTimer.current) {
      clearTimeout(hoverDelayTimer.current);
      hoverDelayTimer.current = null;
    }
  };

  const activateDelayedHover = () => {
    setIsHoverReady(true);
    onGuidePanelHover?.();
  };

  const handleMouseEnter = () => {
    clearHoverDelay();
    hoverDelayTimer.current = setTimeout(activateDelayedHover, 200);
  };

  const handleMouseLeave = () => {
    clearHoverDelay();
    setIsHoverReady(false);
  };

  const handleFocus = () => {
    clearHoverDelay();
    activateDelayedHover();
  };

  useEffect(() => clearHoverDelay, []);

  return (
    <div
      className={`order-card-scene ${isHoverReady ? "order-card-scene--hover-ready" : ""} ${isGuidePinned ? "order-card-scene--guide-pinned" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
    >
      <div className="order-card-depth order-card-depth--three" />
      <div className="order-card-depth order-card-depth--two" />
      <div className="order-card-depth order-card-depth--one" />

      <article className="order-card">
        {/* HEADER */}
        <header className="order-card-header">
          <div className="order-card-title-wrapper">
            <div>
              <h2>Новый заказ</h2>
              <p>Выберите площадку и настройте параметры</p>
            </div>
          </div>

          <div className="support-badge">
            <span className="support-dot" />
            Поддержка 24/7
          </div>
        </header>

        <div className="order-card-divider" />

        <div className="order-card-content">
          {/* LEFT */}
          <section className="order-settings">
            {/* PLATFORM */}
            <div className="order-section">
              <h3>
                <span>1.</span> Выберите площадку
              </h3>

              <div className="platform-grid">
                {platforms.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`platform-button ${platform === item.id ? "active" : ""
                      }`}
                    onClick={() => setPlatform(item.id)}
                  >
                    <span className="platform-icon">
                      <img
                        src={item.icon}
                        alt={item.name}
                        className="platform-icon-image"
                      />
                    </span>
                    <span>{item.name}</span>

                    {platform === item.id && (
                      <span className="selected-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* SERVICE */}
            <div className="order-section">
              <h3>
                <span>2.</span> Выберите услугу
              </h3>

              <div className="service-select-wrapper">
                <span className="service-user-icon">♙</span>

                <select
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                  className="service-select"
                >
                  <option>Подписчики</option>
                  <option>Лайки</option>
                  <option>Просмотры</option>
                  <option>Комментарии</option>
                </select>
              </div>
            </div>

            {/* QUANTITY */}
            <div className="order-section">
              <h3>
                <span>3.</span> Укажите количество
              </h3>

              <div className="quantity-row">
                <div className="quantity-control">
                  <button type="button" onClick={decreaseQuantity}>
                    −
                  </button>

                  <strong>{formattedQuantity}</strong>

                  <button type="button" onClick={increaseQuantity}>
                    +
                  </button>
                </div>

                <div className="discount-badge">
                  <strong>-10%</strong>
                  <span>Скидка за объём</span>
                </div>
              </div>
            </div>

            {/* SPEED */}
            <div className="order-section speed-section">
              <h3>
                <span>4.</span> Выберите скорость
              </h3>

              <div className="speed-grid">
                {speeds.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`speed-button ${speed === item.id ? "active" : ""
                      }`}
                    onClick={() => setSpeed(item.id)}
                  >
                    <span className="speed-icon">{item.icon}</span>

                    <span className="speed-content">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </article>

      {/* RIGHT */}
      <aside className="order-summary">
        <h3>Ваш заказ</h3>

        <div className="summary-table">
          <div className="summary-row">
            <span>Площадка</span>

            <strong className="summary-platform">
              <span className="platform-icon">
                <img
                  src={currentPlatform.icon}
                  alt={currentPlatform.name}
                  className="platform-icon-image"
                />
              </span>

              {currentPlatform.name}
            </strong>
          </div>

          <div className="summary-row">
            <span>Услуга</span>
            <strong>{service}</strong>
          </div>

          <div className="summary-row">
            <span>Количество</span>
            <strong>{formattedQuantity}</strong>
          </div>

          <div className="summary-row">
            <span>Скорость</span>
            <strong>{currentSpeed.title}</strong>
          </div>

          <div className="summary-price">
            <div>
              <span>Итого к оплате</span>

              <div className="price-line">
                <strong>1190 ₽</strong>
                <del>1320 ₽</del>
              </div>
            </div>

            <div className="saving-badge">
              Экономия 130 ₽
            </div>
          </div>
        </div>

        <div className="trust-grid">
          <div className="trust-card">
            <span className="trust-icon purple">♢</span>

            <div>
              <strong>Гарантия качества</strong>
            </div>
          </div>

          <div className="trust-card">
            <span className="trust-icon gold">✧</span>

            <div>
              <strong>Безопасный заказ</strong>
            </div>
          </div>
        </div>

        <button type="button" className="payment-button">
          <span>Перейти к оплате</span>
          <span className="payment-arrow">›</span>
        </button>

        <p className="order-terms">
          Нажимая кнопку, Вы соглашаетесь с{" "}
          <a href="#rules">правилами сервиса</a>
        </p>
      </aside>
    </div>
  );
}
