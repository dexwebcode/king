import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroRegisterForm from "../../Hero/HeroRegisterForm";
import "./order.css";
import instagramIcon from "../../../../../assets/social_icons/instagram.svg";
import youtubeIcon from "../../../../../assets/social_icons/youtube.svg";
import tiktokIcon from "../../../../../assets/social_icons/tiktok.svg";
import telegramIcon from "../../../../../assets/social_icons/telegram.svg";
import vkIcon from "../../../../../assets/social_icons/vk.svg";
import xIcon from "../../../../../assets/social_icons/x.svg";
import twitchIcon from "../../../../../assets/social_icons/twich.png";
import rutubeIcon from "../../../../../assets/social_icons/Icon_RUTUBE_dark_color.svg";
import dzenIcon from "../../../../../assets/social_icons/dzen.svg";
import maxIcon from "../../../../../assets/social_icons/max.svg";
import spotifyIcon from "../../../../../assets/social_icons/Spotify.png";
import appleMusicIcon from "../../../../../assets/social_icons/Apple_Musikl.png";

const API_URL = import.meta.env.VITE_API_URL || "";
const ORDER_PREFILL_KEY = "king_order_prefill";

function normalizeRecipientLink(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return trimmedValue;
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue.replace(/^\/+/, "")}`;
}

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
  { id: "twitch", name: "Twitch", placeholder: "TW", icon: twitchIcon },
  { id: "rutube", name: "RuTube", placeholder: "RT", icon: rutubeIcon },
  { id: "dzen", name: "Дзен", placeholder: "ДЗ", icon: dzenIcon },
  { id: "max", name: "MAX", placeholder: "MAX", icon: maxIcon },
  { id: "spotify", name: "Spotify", placeholder: "SP", icon: spotifyIcon },
  { id: "apple_music", name: "Apple Music", placeholder: "AM", icon: appleMusicIcon },
];

const serviceTypeNames = {
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

const orderSteps = [
  { id: "services", number: 1, label: "Услуги" },
  { id: "recipient", number: 2, label: "Оплата" },
];

function getServiceRate(serviceItem) {
  const rawRate = serviceItem?.price_per_1000 ?? serviceItem?.rate;
  const rate = Number(rawRate);

  return Number.isFinite(rate) ? rate : 0;
}

function getCompareServiceRate(serviceItem) {
  const rawRate =
    serviceItem?.compare_price_per_1000 ??
    serviceItem?.compare_rate;
  const rate = Number(rawRate);

  return Number.isFinite(rate) ? rate : getServiceRate(serviceItem);
}

function providerServiceId(item) {
  return String(item?.provider_service_id ?? item?.id ?? item?.service ?? "");
}

function itemServiceType(item) {
  return String(item?.service_type || item?.type || "").toLowerCase();
}

function cleanServiceName(value) {
  return String(value || "Услуга продвижения")
    .replace(/[\u26A1\u2B50\u2605\uFE0F]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findOrderPrice(prices, platform, serviceType, serviceId) {
  if (!platform || !serviceType || !serviceId) {
    return null;
  }

  return prices.find((item) => (
    (item.platform || item.soc) === platform
    && itemServiceType(item) === serviceType
    && providerServiceId(item) === String(serviceId)
  )) || null;
}

function OrderPage({ onDraftSaved }) {
  const [platform, setPlatform] = useState(null);
  const [service, setService] = useState(null);
  const [quantity, setQuantity] = useState(0);
  const [isQuantitySelected, setIsQuantitySelected] = useState(false);
  const [speed, setSpeed] = useState(null);
  const [activeStep, setActiveStep] = useState("services");
  const [recipientLink, setRecipientLink] = useState("");
  const [prices, setPrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthModalOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsAuthModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isAuthModalOpen]);

  useEffect(() => {
    function applyPreset(preset) {
      if (!preset || typeof preset !== "object") {
        return;
      }

      const presetServiceType = preset.service_type || preset.service;
      const presetServiceId = preset.service_id;
      const presetQuantity = Number(preset.quantity);

      if (!preset.platform || !presetServiceType) {
        return;
      }

      setPlatform(preset.platform);
      setService(presetServiceType);
      setSpeed(presetServiceId ? String(presetServiceId) : null);
      setQuantity(Number.isFinite(presetQuantity) ? presetQuantity : 0);
      setIsQuantitySelected(Number.isFinite(presetQuantity));
      setActiveStep("services");
    }

    try {
      const savedPreset = localStorage.getItem(ORDER_PREFILL_KEY);
      if (savedPreset) {
        applyPreset(JSON.parse(savedPreset));
      }
    } catch {
      localStorage.removeItem(ORDER_PREFILL_KEY);
    }

    function handleOrderPrefill(event) {
      applyPreset(event.detail);
    }

    window.addEventListener("king:order-prefill", handleOrderPrefill);
    return () => {
      window.removeEventListener("king:order-prefill", handleOrderPrefill);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPrices() {
      try {
        const response = await fetch(`${API_URL}/price`);
        const data = await response.json();

        if (!response.ok || !data?.success) {
          throw new Error("Не удалось загрузить прайс");
        }

        if (isMounted) {
          setPrices(Array.isArray(data.items) ? data.items : []);
          setPricesError("");
        }
      } catch (error) {
        if (isMounted) {
          setPrices([]);
          setPricesError(error.message || "Не удалось загрузить прайс");
        }
      } finally {
        if (isMounted) {
          setPricesLoading(false);
        }
      }
    }

    loadPrices();

    return () => {
      isMounted = false;
    };
  }, []);

  const availablePlatformIds = [...new Set(
    prices.map((item) => String(item.platform || item.soc || "")).filter(Boolean)
  )];
  const availablePlatforms = availablePlatformIds.map((platformId) => (
    platforms.find((item) => item.id === platformId) || {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      placeholder: platformId.slice(0, 2).toUpperCase(),
      icon: null,
    }
  ));
  const selectedPlatform = availablePlatforms.find((item) => item.id === platform);
  const platformPrices = prices.filter(
    (item) => String(item.platform || item.soc || "") === platform
  );
  const services = [...new Set(platformPrices.map(itemServiceType).filter(Boolean))]
    .map((serviceType) => ({
      id: serviceType,
      name: serviceTypeNames[serviceType]
        || serviceType.charAt(0).toUpperCase() + serviceType.slice(1),
      description: `${platformPrices.filter((item) => itemServiceType(item) === serviceType).length} услуг`,
      icon: "•",
    }));
  const selectedService = services.find((item) => item.id === service);
  const concreteServices = platformPrices
    .filter((item) => itemServiceType(item) === service)
    .sort((left, right) => getServiceRate(left) - getServiceRate(right));

  const selectedOrderPrice = useMemo(() => {
    return findOrderPrice(prices, platform, service, speed);
  }, [prices, platform, service, speed]);
  const selectedSpeed = selectedOrderPrice ? {
    id: providerServiceId(selectedOrderPrice),
    name: cleanServiceName(selectedOrderPrice.name),
  } : null;
  const quantityMin = Number(selectedOrderPrice?.min ?? 0);
  const quantityMax = Number(selectedOrderPrice?.max ?? 0);
  const quantityStep = quantityMax - quantityMin >= 1000 ? 100 : 1;

  useEffect(() => {
    if (!selectedOrderPrice) {
      return;
    }

    setQuantity((current) => (
      current >= quantityMin && current <= quantityMax ? current : quantityMin
    ));
    setIsQuantitySelected(true);
  }, [selectedOrderPrice, quantityMin, quantityMax]);

  const hasVolumeDiscount = quantity >= 1000;

  const total = useMemo(() => {
    if (!selectedOrderPrice) {
      return 0;
    }

    const priceRate = hasVolumeDiscount
      ? getServiceRate(selectedOrderPrice)
      : getCompareServiceRate(selectedOrderPrice);

    return Math.round(((priceRate / 1000) * quantity) * 100) / 100;
  }, [selectedOrderPrice, quantity, hasVolumeDiscount]);

  const oldPrice = useMemo(() => {
    if (!selectedOrderPrice) {
      return total;
    }

    return Math.round(
      ((getCompareServiceRate(selectedOrderPrice) / 1000) * quantity) * 100
    ) / 100;
  }, [selectedOrderPrice, quantity, total]);

  const economy = hasVolumeDiscount ? Math.max(oldPrice - total, 0) : 0;
  const quantityProgress = quantityMax > quantityMin
    ? ((quantity - quantityMin) / (quantityMax - quantityMin)) * 100
    : 0;
  const activeStepIndex = orderSteps.findIndex(
    (item) => item.id === activeStep
  );
  const isServicesComplete = Boolean(
    platform && service && speed && selectedOrderPrice && !pricesLoading
      && quantity >= quantityMin && quantity <= quantityMax
      && recipientLink.trim()
  );
  const canContinue = activeStep === "services" ? isServicesComplete : true;

  const decreaseQuantity = () => {
    if (!selectedOrderPrice) return;
    setIsQuantitySelected(true);
    setQuantity((prev) => Math.max(quantityMin, prev - quantityStep));
  };

  const increaseQuantity = () => {
    if (!selectedOrderPrice) return;
    setIsQuantitySelected(true);
    setQuantity((prev) => Math.min(quantityMax, prev + quantityStep));
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat("ru-RU").format(value);
  };

  const formatMoney = (value) => {
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    if (activeStep === "services") {
      const selectedServiceId = providerServiceId(selectedOrderPrice);
      const draft = {
        version: 2,
        service_id: selectedServiceId,
        platform,
        platform_name: selectedPlatform?.name,
        service_type: service,
        service_type_name: selectedService?.name,
        service_name: selectedSpeed?.name,
        quantity,
        recipient_link: normalizeRecipientLink(recipientLink),
        display_total: formatMoney(total),
        saved_at: new Date().toISOString(),
      };
      localStorage.setItem("king_order_draft", JSON.stringify(draft));

      if (localStorage.getItem("token")) {
        if (onDraftSaved) {
          onDraftSaved(draft);
          return;
        }

        navigate("/main", { state: { section: "create" } });
        return;
      }

      setActiveStep("recipient");
      setIsAuthModalOpen(true);
      return;
    }

    if (activeStep === "recipient") {
      setIsAuthModalOpen(true);
    }
  };

  const handleMainStepClick = (stepId) => {
    const targetStepIndex = orderSteps.findIndex(
      (item) => item.id === stepId
    );

    if (targetStepIndex > activeStepIndex) {
      return;
    }

    setActiveStep(stepId);
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
                const isActive = step.id === activeStep;
                const isCompleted = index < activeStepIndex;
                const isLocked = index > activeStepIndex;

                return (
                  <div className="order-step-group" key={step.id}>
                    <button
                      type="button"
                      className={`order-step ${isActive ? "active" : ""
                        } ${isCompleted ? "completed" : ""} ${isLocked ? "locked" : ""
                        }`}
                      onClick={() => handleMainStepClick(step.id)}
                      aria-current={isActive ? "step" : undefined}
                      aria-disabled={isLocked ? "true" : undefined}
                    >
                      <span>{step.number}</span>
                      <p>{step.label}</p>
                    </button>

                    {index < orderSteps.length - 1 && (
                      <div
                        className={`step-line ${index < activeStepIndex ? "active" : ""
                          } ${index === 0 ? "step-line--choices" : ""}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </header>

          <div className={`order-config order-config--${activeStep}`}>
            {activeStep === "services" && (
              <>
                <div className="form-section">
                  <div className="section-heading">
                    <h2>1. Выберите платформу</h2>
                    <p>Выберите, где вы хотите продвинуть ваш аккаунт</p>
                  </div>

                  <div className="platform-grid">
                    {availablePlatforms.map((item) => {
                      const isActive = platform === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`platform-card ${isActive ? "active" : ""
                            }`}
                          onClick={() => {
                            const nextPlatform = platform === item.id ? null : item.id;
                            setPlatform(nextPlatform);
                            setService(null);
                            setSpeed(null);
                            setQuantity(0);
                            setIsQuantitySelected(false);
                          }}
                        >
                          <div className="platform-placeholder">
                            {item.icon
                              ? <img src={item.icon} alt="" aria-hidden="true" />
                              : <span>{item.placeholder}</span>}
                          </div>

                          <span className="platform-name">
                            {item.name}
                          </span>
                        </button>
                      );
                    })}
                    {!pricesLoading && availablePlatforms.length === 0 && (
                      <p className="order-options-empty">Доступных площадок пока нет</p>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <div className="section-heading">
                    <h2>2. Вид накрутки</h2>
                    <p>Показаны только доступные виды для выбранной площадки</p>
                  </div>

                  <div className="services-grid">
                    {services.map((item) => {
                      const isActive = service === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`service-card ${isActive ? "active" : ""
                            }`}
                          onClick={() => {
                            const nextService = service === item.id ? null : item.id;
                            setService(nextService);
                            setSpeed(null);
                            setQuantity(0);
                            setIsQuantitySelected(false);
                          }}
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

                <div className="form-section speed-section">
                  <div className="section-heading">
                    <h2>3. Выберите конкретную услугу</h2>
                    <p>Цена и ограничения загружены из актуального каталога</p>
                  </div>

                  <div className="speed-grid">
                    {concreteServices.map((item) => {
                      const itemId = providerServiceId(item);
                      const isActive = speed === itemId;

                      return (
                        <button
                          type="button"
                          key={itemId}
                          className={`speed-card ${isActive ? "active" : ""
                            }`}
                          onClick={() => {
                            if (isActive) {
                              setSpeed(null);
                              setQuantity(0);
                              setIsQuantitySelected(false);
                              return;
                            }

                            const minimum = Number(item.min || 1);
                            setSpeed(itemId);
                            setQuantity(minimum);
                            setIsQuantitySelected(true);
                          }}
                        >
                          <strong>{cleanServiceName(item.name)}</strong>
                          <span>{formatMoney(getServiceRate(item))} ₽ за 1 000 · #{itemId}</span>
                        </button>
                      );
                    })}
                    {service && concreteServices.length === 0 && (
                      <p className="order-options-empty">Услуг этого вида пока нет</p>
                    )}
                  </div>
                </div>

                <div className="form-section quantity-section">
                  <div className="section-heading">
                    <h2>4. Укажите количество</h2>
                    <p>Сколько единиц продвижения вам нужно?</p>
                  </div>

                  <div className="quantity-top">
                    <div
                      className={`quantity-control ${isQuantitySelected ? "active" : ""
                        }`}
                    >
                      <button
                        type="button"
                        onClick={decreaseQuantity}
                      >
                        −
                      </button>

                      <div className="quantity-value">
                        {selectedOrderPrice ? formatNumber(quantity) : "—"}
                      </div>

                      <button
                        type="button"
                        onClick={increaseQuantity}
                      >
                        +
                      </button>
                    </div>

                    <div className="discount-info">
                      <span>{hasVolumeDiscount ? "-25%" : "-0%"}</span>
                      <p>{hasVolumeDiscount ? "Скидка за объём" : "Скидки нет"}</p>
                    </div>

                    <div className="range-wrapper">
                      <input
                        type="range"
                        min={quantityMin || 0}
                        max={quantityMax || 1}
                        step={quantityStep}
                        value={quantity || 0}
                        disabled={!selectedOrderPrice}
                        style={{ "--quantity-progress": `${quantityProgress}%` }}
                        onChange={(event) => {
                          setIsQuantitySelected(true);
                          setQuantity(Number(event.target.value));
                        }}
                      />

                      <div className="range-labels">
                        <span>{selectedOrderPrice ? formatNumber(quantityMin) : "—"}</span>
                        <span>{selectedOrderPrice ? formatNumber(quantityMax) : "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {activeStep === "recipient" && (
              <div className="order-draft-notice">
                <span className="order-draft-mark" aria-hidden="true">✓</span>
                <p>Заказ сохранён в этом браузере</p>
                <h2>Авторизируйтесь, чтобы закончить оформление</h2>
                <span>
                  После входа мы автоматически откроем заказ в личном кабинете.
                </span>
              </div>
            )}
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
              <span>Вид накрутки</span>
              <strong>
                {selectedService?.name || "—"}
              </strong>
            </div>

            <div className="summary-row">
              <span>Количество</span>
              <strong>
                {isQuantitySelected ? formatNumber(quantity) : "—"}
              </strong>
            </div>

            <div className="summary-row">
              <span>Услуга</span>
              <strong>{selectedSpeed?.name || "—"}</strong>
            </div>

            <div className="summary-total">
              <div className="summary-total-top">
                <span>Итого к оплате</span>

                {(pricesLoading || pricesError || !selectedOrderPrice || hasVolumeDiscount) && (
                  <div className="saving">
                    {pricesLoading
                      ? "Прайс загружается"
                      : pricesError
                        ? "Прайс недоступен"
                        : selectedOrderPrice
                          ? `Экономия ${formatMoney(economy)} ₽`
                          : "Нет услуги"}
                  </div>
                )}
              </div>

              <div className="price-line">
                <strong>
                  {selectedOrderPrice ? `${formatMoney(total)} ₽` : "—"}
                </strong>

                {selectedOrderPrice && hasVolumeDiscount && (
                  <del>
                    {formatMoney(oldPrice)} ₽
                  </del>
                )}
              </div>
            </div>
          </div>

          <div className="benefits">
            <div className="recipient-panel">
              <div className="recipient-field">
                <div className="recipient-input-wrapper">
                  <div className="recipient-platform">
                    {selectedPlatform && (
                      selectedPlatform.icon
                        ? <img src={selectedPlatform.icon} alt="" aria-hidden="true" />
                        : <span>{selectedPlatform.placeholder}</span>
                    )}
                  </div>

                  <input
                    type="url"
                    name="recipient-link"
                    autoComplete="url"
                    value={recipientLink}
                    onChange={(event) => setRecipientLink(event.target.value)}
                    placeholder="Вставьте ссылку"
                  />
                </div>
              </div>
            </div>

          </div>

          <div className="summary-bottom">
            <button
              className={`continue-button ${canContinue ? "ready" : ""
                }`}
              type="button"
              onClick={handleContinue}
              disabled={!canContinue}
            >
              <span>
                {activeStep === "services"
                  ? "Продолжить"
                  : "Авторизироваться"}
              </span>
              <span>→</span>
            </button>

            <p className="agreement">
              Нажимая кнопку, вы соглашаетесь с{" "}
              <a href="/">правилами сервиса</a>
            </p>
          </div>
        </aside>
      </div>

      {isAuthModalOpen && (
        <div
          className="order-auth-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsAuthModalOpen(false);
            }
          }}
        >
          <section
            className="order-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-auth-title"
          >
            <button
              className="order-auth-close"
              type="button"
              aria-label="Закрыть окно авторизации"
              onClick={() => setIsAuthModalOpen(false)}
            >
              ×
            </button>

            <div className="order-auth-login-column">
              <div className="order-auth-intro">
                <p className="order-auth-eyebrow">Черновик сохранён в браузере</p>
                <h2 id="order-auth-title">Авторизуйтесь, чтобы продолжить</h2>
                <p>
                  После входа заказ появится в вашем кабинете. Там вы сможете
                  проверить данные и перейти к безопасной оплате.
                </p>
              </div>

              <div className="order-auth-form">
                <HeroRegisterForm initialMode="login" />
              </div>
            </div>

            <aside className="order-auth-summary">
              <div className="summary-glow" />

              <div className="summary-header">
                <h2>Ваш заказ</h2>
                <div className="summary-logo">✦</div>
              </div>

              <div className="summary-table">
                <div className="summary-row">
                  <span>Площадка</span>
                  <strong className="order-auth-summary-platform">
                    {selectedPlatform && (
                      selectedPlatform.icon
                        ? <img src={selectedPlatform.icon} alt="" aria-hidden="true" />
                        : <span>{selectedPlatform.placeholder}</span>
                    )}
                    {selectedPlatform?.name || "—"}
                  </strong>
                </div>
                <div className="summary-row">
                  <span>Вид накрутки</span>
                  <strong>{selectedService?.name || "—"}</strong>
                </div>
                <div className="summary-row">
                  <span>Услуга</span>
                  <strong>{selectedSpeed?.name || "—"}</strong>
                </div>
                <div className="summary-row">
                  <span>Количество</span>
                  <strong>{formatNumber(quantity)} шт.</strong>
                </div>
                <div className="summary-row order-auth-summary-link">
                  <span>Ссылка</span>
                  <strong>
                    {normalizeRecipientLink(recipientLink)}
                    {selectedPlatform && (
                      selectedPlatform.icon
                        ? <img src={selectedPlatform.icon} alt={selectedPlatform.name} />
                        : <span>{selectedPlatform.placeholder}</span>
                    )}
                  </strong>
                </div>

                <div className="summary-total">
                  <div className="summary-total-top">
                    <span>Итого к оплате</span>
                    {hasVolumeDiscount && (
                      <div className="saving">Экономия {formatMoney(economy)} ₽</div>
                    )}
                  </div>
                  <div className="price-line">
                    <strong>{formatMoney(total)} ₽</strong>
                    {hasVolumeDiscount && <del>{formatMoney(oldPrice)} ₽</del>}
                  </div>
                </div>
              </div>

              <p className="order-auth-summary-note">
                Данные сохранены в этом браузере и будут перенесены в кабинет после входа.
              </p>
            </aside>
          </section>
        </div>
      )}
    </div>
  );
}

export default OrderPage;
