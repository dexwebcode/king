import { useMemo, useState } from "react";
import "./order.css";
import instagramIcon from "../../../../../assets/social_icons/instagram.svg";
import youtubeIcon from "../../../../../assets/social_icons/youtube.svg";
import tiktokIcon from "../../../../../assets/social_icons/tiktok.svg";
import telegramIcon from "../../../../../assets/social_icons/telegram.svg";
import vkIcon from "../../../../../assets/social_icons/vk.svg";
import xIcon from "../../../../../assets/social_icons/x.svg";

const platforms = [
  {
    id: "instagram",
    name: "Instagram",
    placeholder: "IG",
    icon: instagramIcon,
  },
  {
    id: "youtube",
    name: "YouTube",
    placeholder: "YT",
    icon: youtubeIcon,
  },
  {
    id: "tiktok",
    name: "TikTok",
    placeholder: "TT",
    icon: tiktokIcon,
  },
  {
    id: "telegram",
    name: "Telegram",
    placeholder: "TG",
    icon: telegramIcon,
  },
  {
    id: "vk",
    name: "VK",
    placeholder: "VK",
    icon: vkIcon,
  },
  {
    id: "x",
    name: "X",
    placeholder: "X",
    icon: xIcon,
  },
];

const services = [
  {
    id: "followers",
    name: "Подписчики",
    description: "Живые подписчики",
    icon: "◎",
  },
  {
    id: "likes",
    name: "Лайки",
    description: "Активность на посты",
    icon: "♡",
  },
  {
    id: "views",
    name: "Просмотры",
    description: "Просмотры видео",
    icon: "◉",
  },
  {
    id: "complex",
    name: "Комплексное",
    description: "Подписчики + лайки",
    icon: "↗",
  },
];

const servicePrices = {
  followers: 1.19,
  likes: 0.45,
  views: 0.18,
  complex: 1.55,
};

const speeds = [
  {
    id: "standard",
    name: "Обычная",
    description: "1-2 дня",
  },
  {
    id: "fast",
    name: "Быстрая",
    description: "До 12 часов",
  },
  {
    id: "instant",
    name: "Мгновенная",
    description: "До 2 часов",
  },
];

const orderSteps = [
  { id: "services", number: 1, label: "Услуги" },
  { id: "recipient", number: 2, label: "Получатель" },
  { id: "payment", number: 3, label: "Оплата" },
];

function OrderPage() {
  const [platform, setPlatform] = useState("instagram");
  const [service, setService] = useState("followers");
  const [quantity, setQuantity] = useState(1000);
  const [speed, setSpeed] = useState("fast");
  const [activeStep, setActiveStep] = useState("services");

  const selectedPlatform = platforms.find(
    (item) => item.id === platform
  );

  const selectedService = services.find(
    (item) => item.id === service
  );

  const selectedSpeed = speeds.find(
    (item) => item.id === speed
  );

  const discount = quantity >= 1000 ? 0.1 : 0;

  const total = useMemo(() => {
    const price = servicePrices[service] * quantity;
    return Math.round(price * (1 - discount));
  }, [service, quantity, discount]);

  const oldPrice = useMemo(() => {
    return Math.round(servicePrices[service] * quantity);
  }, [service, quantity]);

  const economy = oldPrice - total;

  const decreaseQuantity = () => {
    setQuantity((prev) => Math.max(100, prev - 100));
  };

  const increaseQuantity = () => {
    setQuantity((prev) => Math.min(100000, prev + 100));
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat("ru-RU").format(value);
  };

  return (
    <div className="order-page">
      <div className="order-shell">
        <section className="order-main">
          <header className="order-header">
            <div>
              <h1>Быстрый заказ</h1>
              <p>Создайте заказ за несколько простых шагов</p>
            </div>

            <div className="order-steps" aria-label="Этапы заказа">
              {orderSteps.map((step, index) => {
                const stepIndex = orderSteps.findIndex(
                  (item) => item.id === activeStep
                );
                const isActive = step.id === activeStep;
                const isCompleted = index < stepIndex;

                return (
                  <div className="order-step-group" key={step.id}>
                    <button
                      type="button"
                      className={`order-step ${
                        isActive ? "active" : ""
                      } ${isCompleted ? "completed" : ""}`}
                      onClick={() => setActiveStep(step.id)}
                      aria-current={isActive ? "step" : undefined}
                    >
                      <span>{step.number}</span>
                      <p>{step.label}</p>
                    </button>

                    {index < orderSteps.length - 1 && (
                      <div
                        className={`step-line ${
                          index < stepIndex ? "active" : ""
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </header>

          <div className="order-config">
            {/* PLATFORM */}
            <div className="form-section">
              <div className="section-heading">
                <h2>1. Выберите платформу</h2>
                <p>Выберите, где вы хотите продвинуть ваш аккаунт</p>
              </div>

              <div className="platform-grid">
                {platforms.map((item) => {
                  const isActive = platform === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`platform-card ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => setPlatform(item.id)}
                    >
                      {isActive && (
                        <span className="selected-mark">
                          ✓
                        </span>
                      )}

                      <div className="platform-placeholder">
                        <img src={item.icon} alt="" aria-hidden="true" />
                      </div>

                      <span className="platform-name">
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SERVICE */}
            <div className="form-section">
              <div className="section-heading">
                <h2>2. Выберите услугу</h2>
                <p>Укажите тип продвижения</p>
              </div>

              <div className="services-grid">
                {services.map((item) => {
                  const isActive = service === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`service-card ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => setService(item.id)}
                    >
                      <span className="service-icon">
                        {item.icon}
                      </span>

                      <span className="service-copy">
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* QUANTITY */}
            <div className="form-section quantity-section">
              <div className="section-heading">
                <h2>3. Укажите количество</h2>
                <p>Сколько единиц продвижения вам нужно?</p>
              </div>

              <div className="quantity-top">
                <div className="quantity-control">
                  <button
                    type="button"
                    onClick={decreaseQuantity}
                  >
                    −
                  </button>

                  <div className="quantity-value">
                    {formatNumber(quantity)}
                  </div>

                  <button
                    type="button"
                    onClick={increaseQuantity}
                  >
                    +
                  </button>
                </div>

                <div className="discount-info">
                  <span>-10%</span>
                  <p>Скидка за объём</p>
                </div>

                <div className="range-wrapper">
                  <input
                    type="range"
                    min="100"
                    max="100000"
                    step="100"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  />

                  <div className="range-labels">
                    <span>100</span>
                    <span>100 000</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SPEED */}
            <div className="form-section speed-section">
              <div className="section-heading">
                <h2>4. Выберите скорость</h2>
                <p>Настройте срок выполнения заказа</p>
              </div>

              <div className="speed-grid">
                {speeds.map((item) => {
                  const isActive = speed === item.id;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`speed-card ${isActive ? "active" : ""}`}
                      onClick={() => setSpeed(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SUMMARY */}
        <aside className="order-summary">
          <div className="summary-glow" />

          <div className="summary-header">
            <h2>Ваш заказ</h2>

            <div className="summary-logo">
              ✦
            </div>
          </div>

          <div className="summary-table">
            <div className="summary-row">
              <span>Платформа</span>

              <strong className="summary-platform">
                <span className="summary-placeholder">
                  <img
                    src={selectedPlatform.icon}
                    alt=""
                    aria-hidden="true"
                  />
                </span>

                {selectedPlatform.name}
              </strong>
            </div>

            <div className="summary-row">
              <span>Услуга</span>
              <strong>
                {selectedService.name}
              </strong>
            </div>

            <div className="summary-row">
              <span>Количество</span>
              <strong>
                {formatNumber(quantity)}
              </strong>
            </div>

            <div className="summary-row">
              <span>Скорость</span>
              <strong>{selectedSpeed.name}</strong>
            </div>

            <div className="summary-total">
              <div className="summary-total-top">
                <span>Итого к оплате</span>

                <div className="saving">
                  Экономия {formatNumber(economy)} ₽
                </div>
              </div>

              <div className="price-line">
                <strong>
                  {formatNumber(total)} ₽
                </strong>

                <del>
                  {formatNumber(oldPrice)} ₽
                </del>
              </div>
            </div>
          </div>

          <div className="benefits">
            <div className="benefit-card">
              <div className="benefit-icon">
                ◇
              </div>

              <div>
                <strong>Гарантия качества</strong>
                <span>30 дней</span>
              </div>
            </div>

            <div className="benefit-card">
              <div className="benefit-icon">
                ▣
              </div>

              <div>
                <strong>Безопасный заказ</strong>
                <span>Без риска для аккаунта</span>
              </div>
            </div>

          </div>

          <div className="summary-bottom">
            <button
              className="continue-button"
              type="button"
            >
              <span>Продолжить</span>
              <span>→</span>
            </button>

            <p className="agreement">
              Нажимая кнопку, вы соглашаетесь с{" "}
              <a href="/">правилами сервиса</a>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default OrderPage;
