import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../../../../ui/i18n";

import HeroRegisterForm from "../Hero/HeroRegisterForm";
import commentsIcon from "../../../../assets/icons/comments.svg";
import friendsIcon from "../../../../assets/icons/friends.svg";
import historyIcon from "../../../../assets/icons/history.svg";
import likesIcon from "../../../../assets/icons/likes.svg";
import listeningIcon from "../../../../assets/icons/listening.svg";
import pollsIcon from "../../../../assets/icons/opros.svg";
import podcastsIcon from "../../../../assets/icons/podcasts.svg";
import repostIcon from "../../../../assets/icons/repost.svg";
import saveIcon from "../../../../assets/icons/save.svg";
import sbpIcon from "../../../../assets/icons/sbp.svg";
import helecatIcon from "../../../../assets/icons/helecat.svg";
import crystalpayIcon from "../../../../assets/icons/cristalpay.svg";
import showIcon from "../../../../assets/icons/show.svg";
import statsIcon from "../../../../assets/icons/stats.svg";
import subscribeIcon from "../../../../assets/icons/subscribe.svg";
import translationIcon from "../../../../assets/icons/translation.svg";
import {
  cleanServiceName,
  compareServiceRate,
  displayPlatform,
  displayServiceType,
  formatMoney,
  itemServiceType,
  platformIcon,
  platformOrder,
  providerServiceId,
  serviceRate,
} from "../../../../ui/catalogMeta";
import {
  clearPendingCheckoutDraft,
  savePendingCheckoutDraft,
} from "../../../../ui/orderDraft";
import { getCachedPrices, getPrices } from "../../../../ui/dataCache";
import { rememberCheckoutWindow } from "../../../../ui/checkoutWindow";
import Modal from "../../../../ui/Modal";
import PaymentMethodCard from "../../../../ui/PaymentMethodCard";
import { usePaymentOverlay } from "../../../../ui/PaymentOverlay";
import AmountSlider from "./AmountSlider";
import "./order.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const ORDER_PREFILL_KEY = "king_order_prefill";
const CATALOG_ROUTE = "/catalog";

const steps = [
  { id: "platform", label: "Площадка" },
  { id: "type", label: "Тип" },
  { id: "service", label: "Услуга" },
  { id: "parameters", label: "Параметры" },
  { id: "payment", label: "Оплата" },
];

const paymentMethods = [
  {
    id: "sbp",
    name: "СБП",
    caption: "Оплата через ЮKassa по QR-коду, через приложение банка",
    mark: "СБП",
    icon: sbpIcon,
    badge: "Без комиссии",
    provider: "ЮKassa",
  },
  {
    id: "crystalpay",
    name: "CrystalPAY",
    caption: "Оплата криптовалютой и рублями через LolzMarket",
    mark: "CP",
    icon: crystalpayIcon,
    badge: "Новый способ",
    provider: "CrystalPAY",
  },
  {
    id: "heleket",
    name: "Heleket",
    caption: "Оплата криптовалютой: BTC, USDT и другие",
    mark: "Heleket",
    icon: helecatIcon,
    badge: "Криптовалюта",
    provider: "Heleket",
  },
];

const quickQuantityOptions = [100, 500, 1000, 5000];


const serviceTypeIcons = {
  likes: likesIcon,
  reposts: repostIcon,
  comments: commentsIcon,
  views: showIcon,
  listenings: listeningIcon,
  followers: subscribeIcon,
  saves: saveIcon,
  statistics: statsIcon,
  stories: historyIcon,
  podcasts: podcastsIcon,
  livestream: translationIcon,
  friends: friendsIcon,
  polls: pollsIcon,
};

const quickOrderHiddenPlatforms = [
  "shazam",
];

function isMorePlatformsSlot(platformId) {
  const value = normalizePlatformSearch(
    `${platformId} ${displayPlatform(platformId)}`,
  );

  return value === "max" || value === "макс";
}

function normalizePlatformSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "");
}

function isHiddenOnQuickOrder(platformId) {
  const value = normalizePlatformSearch(
    `${platformId} ${displayPlatform(platformId)}`,
  );

  return quickOrderHiddenPlatforms.some((item) => value.includes(item));
}

function normalizeRecipientLink(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, "")}`;
}

function isValidRecipientLink(value) {
  try {
    const url = new URL(normalizeRecipientLink(value));
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/* Одна подпись дублирует другую, если совпадает целиком или входит в неё. */
function isDuplicateLabel(first, second) {
  const left = String(first || "").trim().toLowerCase();
  const right = String(second || "").trim().toLowerCase();

  if (!left || !right) return false;

  return left.includes(right) || right.includes(left);
}

/* Вариант/скорость услуги — хвост названия после «-»:
   «Лайки - Быстрые ⚡️⚡️» → «Быстрые». */
function serviceSpeedLabel(value) {
  const name = String(value || "")
    .replace(/[\u26A1\u2B50\u2605\uFE0F\uFE0E\u267B\u2699]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const parts = name.split(/\s[-–—]\s*/);

  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

function apiError(data, fallback) {
  return typeof data?.detail === "string" ? data.detail : fallback;
}

function WizardHeading({ step, title, description }) {
  const { t } = useLanguage();

  return (
    <div className="wizard-heading">
      <div className="wizard-heading-meta">
        <span>{t("Шаг {step}", { step })}</span>
      </div>
      {title ? <h2>{title}</h2> : null}
      {description && <p>{description}</p>}
    </div>
  );
}

function OrderPage({ initialDraft = null, onCheckoutRestored }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { open: openPaymentOverlay } = usePaymentOverlay();
  const location = useLocation();
  const restoredDraftRef = useRef(false);

  const [prices, setPrices] = useState(() => getCachedPrices() || []);
  const [loadState, setLoadState] = useState(() => getCachedPrices() ? "ready" : "loading");
  const [step, setStep] = useState(initialDraft ? 4 : 0);
  const [platform, setPlatform] = useState(
    String(initialDraft?.platform || ""),
  );
  const [serviceType, setServiceType] = useState(
    String(initialDraft?.service_type || ""),
  );
  const [serviceId, setServiceId] = useState(
    String(initialDraft?.service_id || ""),
  );
  const [quantity, setQuantity] = useState(
    Number(initialDraft?.quantity || 0),
  );
  /* Строка в поле ввода количества: позволяет свободно стирать и набирать
     число, не сбрасывая значение на ноль на каждом нажатии. */
  const [quantityInput, setQuantityInput] = useState(() =>
    initialDraft?.quantity ? String(Number(initialDraft.quantity)) : "",
  );
  const [quantityTouched, setQuantityTouched] = useState(
    Boolean(initialDraft?.quantity),
  );
  const [recipientLink, setRecipientLink] = useState(
    String(initialDraft?.recipient_link || ""),
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialDraft?.payment_method || "sbp",
  );
  const [idempotenceKey] = useState(
    () => initialDraft?.idempotence_key || crypto.randomUUID(),
  );
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const isMainPage = location.pathname.startsWith("/main");

  useEffect(() => {
    let active = true;

    getPrices()
      .then((items) => {
        if (active) {
          setPrices(items);
          setLoadState("ready");
        }
      })
      .catch(() => active && setLoadState("error"));

    return () => {
      active = false;
    };
  }, []);

  /* Ручной повтор загрузки цен: одна сетевая неудача раньше залипала навсегда. */
  function retryPrices() {
    setLoadState("loading");
    getPrices()
      .then((items) => {
        setPrices(items);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }

  useEffect(() => {
    function applyPreset(preset) {
      const nextPlatform = String(preset?.platform || "");
      const nextType = String(
        preset?.service_type || preset?.service || "",
      );
      const nextServiceId = String(preset?.service_id || "");

      if (!nextPlatform) return false;

      setPlatform(nextPlatform);
      setServiceType(nextType);
      setServiceId(nextServiceId);

      if (Number.isFinite(Number(preset.quantity))) {
        const nextQuantity = Number(preset.quantity);
        setQuantity(nextQuantity);
        setQuantityTouched(nextQuantity > 0);
      }

      setRecipientLink(String(preset.recipient_link || ""));
      setPaymentMethod(preset.payment_method || "sbp");
      setStep(nextServiceId ? 3 : nextType ? 2 : 1);

      return true;
    }

    function handleOrderPrefill(event) {
      applyPreset(event.detail);
      localStorage.removeItem(ORDER_PREFILL_KEY);
    }

    try {
      const rawPreset = localStorage.getItem(ORDER_PREFILL_KEY);
      if (rawPreset) applyPreset(JSON.parse(rawPreset));
    } catch {
      // Ignore an invalid one-time preset and start with an empty form.
    } finally {
      localStorage.removeItem(ORDER_PREFILL_KEY);
    }

    window.addEventListener("king:order-prefill", handleOrderPrefill);

    return () =>
      window.removeEventListener("king:order-prefill", handleOrderPrefill);
  }, []);

  const availablePlatforms = useMemo(() => {
    const ids = [
      ...new Set(
        prices
          .map((item) => String(item.platform || item.soc || ""))
          .filter(Boolean),
      ),
    ];

    return ids.sort((left, right) => {
      const leftIndex = platformOrder.indexOf(left);
      const rightIndex = platformOrder.indexOf(right);

      return (
        (leftIndex < 0 ? 999 : leftIndex) -
        (rightIndex < 0 ? 999 : rightIndex)
      );
    });
  }, [prices]);

  const visiblePlatforms = useMemo(() => {
    if (isMainPage) return availablePlatforms;

    return availablePlatforms.filter(
      (item) => !isHiddenOnQuickOrder(item),
    );
  }, [availablePlatforms, isMainPage]);

  const platformServices = useMemo(
    () =>
      prices.filter(
        (item) =>
          String(item.platform || item.soc || "") === platform,
      ),
    [platform, prices],
  );

  const availableTypes = useMemo(
    () => [
      ...new Set(platformServices.map(itemServiceType).filter(Boolean)),
    ],
    [platformServices],
  );

  const concreteServices = useMemo(
    () =>
      platformServices
        .filter((item) => itemServiceType(item) === serviceType)
        .sort(
          (left, right) =>
            serviceRate(left) - serviceRate(right),
        ),
    [platformServices, serviceType],
  );

  const selectedService =
    prices.find(
      (item) => providerServiceId(item) === serviceId,
    ) || null;

  const quantityMin = Number(selectedService?.min || 1);
  const quantityMax = Number(
    selectedService?.max || quantityMin,
  );
  const quantityStep = Math.max(
    1,
    Number(selectedService?.step || 1),
  );

  useEffect(() => {
    if (!selectedService) return;

    setQuantity((current) =>
      current >= 0 && current <= quantityMax
        ? current
        : 0,
    );
  }, [selectedService, quantityMin, quantityMax]);

  /* Значение поменяли извне (ползунок, быстрые суммы, черновик) — обновляем поле. */
  useEffect(() => {
    setQuantityInput(quantity > 0 ? String(quantity) : "");
  }, [quantity]);

  useEffect(() => {
    if (
      !initialDraft ||
      loadState !== "ready" ||
      restoredDraftRef.current
    ) {
      return;
    }

    restoredDraftRef.current = true;

    if (!selectedService) {
      setValidationMessage(
        t("Сохранённая услуга больше недоступна. Выберите актуальный вариант."),
      );
      setServiceId("");
      setStep(serviceType ? 2 : platform ? 1 : 0);
    }

    clearPendingCheckoutDraft();
    onCheckoutRestored?.();
  }, [
    initialDraft,
    loadState,
    onCheckoutRestored,
    platform,
    selectedService,
    serviceType,
  ]);

  const total = useMemo(() => {
    if (!selectedService || !quantity) return 0;

    const rate =
      quantity >= 1000
        ? serviceRate(selectedService)
        : compareServiceRate(selectedService);

    return (
      Math.round(((rate * quantity) / 1000) * 100) / 100
    );
  }, [quantity, selectedService]);

  const quantityValid =
    Boolean(selectedService) &&
    Number.isInteger(quantity) &&
    quantity >= quantityMin &&
    quantity <= quantityMax;

  const linkValid = isValidRecipientLink(recipientLink);

  const serviceSpeed =
    selectedService?.speed ||
    selectedService?.speed_text ||
    selectedService?.average_time ||
    selectedService?.avg_time ||
    selectedService?.start_time ||
    "";

  const maxAvailableStep = serviceId
    ? quantityTouched && quantityValid
      ? 4
      : 3
    : serviceType
      ? 2
      : platform
        ? 1
        : 0;

  const canPay =
    step === 4 &&
    Boolean(selectedService) &&
    quantityValid &&
    Boolean(paymentMethod) &&
    linkValid &&
    !paymentLoading;

  function selectPlatform(nextPlatform) {
    setPlatform(nextPlatform);
    setServiceType("");
    setServiceId("");
    setQuantity(0);
    setQuantityTouched(false);
    setRecipientLink("");
    setValidationMessage("");
    setStep(1);
  }

  function selectType(nextType) {
    setServiceType(nextType);
    setServiceId("");
    setQuantity(0);
    setQuantityTouched(false);
    setRecipientLink("");
    setValidationMessage("");
    setStep(2);
  }

  function selectConcreteService(item) {
    setServiceId(providerServiceId(item));
    setQuantity(0);
    setQuantityTouched(false);
    setRecipientLink("");
    setValidationMessage("");
    setStep(3);
  }

  function changeQuantity(nextQuantity) {
    const value = Number(nextQuantity);

    if (!Number.isFinite(value)) return;

    setQuantity(value);
    setQuantityTouched(true);
    setValidationMessage("");
  }

  /* Ввод в поле количества: показываем то, что набрал пользователь.
     Если цифры стёрли — выбранное количество сбрасывается. */
  function changeQuantityInput(nextValue) {
    /* Только цифры: буквы и посторонние символы отбрасываем. */
    const rawValue = String(nextValue).replace(/\D/g, "");

    setQuantityInput(rawValue);
    setValidationMessage("");

    const trimmedValue = rawValue.trim();
    if (trimmedValue === "") {
      setQuantity(0);
      setQuantityTouched(true);
      return;
    }

    const parsedValue = Number(trimmedValue);
    if (!Number.isFinite(parsedValue)) return;

    setQuantity(parsedValue);
    setQuantityTouched(true);
  }

  function normalizeQuantity() {
    if (!selectedService) return;

    const parsedValue = Number(quantityInput);
    const safeValue =
      Number.isFinite(parsedValue) && parsedValue > 0
        ? Math.min(quantityMax, Math.max(quantityMin, Math.round(parsedValue)))
        : Math.max(quantity, quantityMin);

    setQuantityInput(String(safeValue));
    setQuantity(safeValue);
    setQuantityTouched(true);
    setValidationMessage("");
  }

  function goToNextStep() {
    if (!selectedService) {
      setValidationMessage(t("Сначала выберите услугу"));
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < quantityMin ||
      quantity > quantityMax
    ) {
      setValidationMessage(
        t("Введите целое количество от {min} до {max}", {
          min: quantityMin,
          max: quantityMax,
        }),
      );
      return;
    }

    setQuantityTouched(true);
    setValidationMessage("");
    setStep(4);
  }

  function buildDraft() {
    return {
      version: 4,
      service_id: serviceId,
      platform,
      platform_name: displayPlatform(platform),
      service_type: serviceType,
      service_type_name: displayServiceType(serviceType),
      service_name: cleanServiceName(selectedService?.name),
      quantity,
      recipient_link: normalizeRecipientLink(recipientLink),
      display_total: formatMoney(total),
      payment_method: paymentMethod,
      idempotence_key: idempotenceKey,
      saved_at: new Date().toISOString(),
    };
  }

  async function payOrder() {
    if (!selectedService || paymentLoading) return;

    if (!quantityValid) {
      setValidationMessage(
        t("Введите целое количество от {min} до {max}", {
          min: quantityMin,
          max: quantityMax,
        }),
      );
      return;
    }

    if (!recipientLink.trim()) {
      setValidationMessage(
        t("Введите ссылку на страницу, публикацию или канал"),
      );
      return;
    }

    if (!linkValid) {
      setValidationMessage(
        t("Введите корректную ссылку на страницу или публикацию"),
      );
      return;
    }

    const draft = buildDraft();
    const token = localStorage.getItem("token");

    if (!token) {
      savePendingCheckoutDraft(draft);
      setIsAuthModalOpen(true);
      return;
    }

    const checkoutWindow = window.open("about:blank", "king-payment-checkout");
    if (checkoutWindow) checkoutWindow.opener = null;
    rememberCheckoutWindow(checkoutWindow);

    try {
      setPaymentLoading(true);
      setValidationMessage("");

      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          service_id: draft.service_id,
          quantity: draft.quantity,
          recipient_link: draft.recipient_link,
          payment_method: draft.payment_method,
          idempotence_key: draft.idempotence_key,
        }),
      });

      const data = await response.json();

      if (
        !response.ok ||
        !data?.order_id ||
        !data?.attempt_id ||
        !data?.confirmation_url
      ) {
        throw new Error(
          apiError(data, t("Не удалось создать платёж")),
        );
      }

      clearPendingCheckoutDraft();
      localStorage.setItem("pending_order_id", String(data.order_id));
      localStorage.setItem("king_pending_payment", JSON.stringify({
        attempt_id: data.attempt_id,
        purpose: "order",
        provider: data.provider || draft.payment_method,
        checkout_url: data.confirmation_url,
        order_id: data.order_id,
      }));
      if (checkoutWindow) checkoutWindow.location.replace(data.confirmation_url);
      openPaymentOverlay({ attemptId: data.attempt_id, purpose: "order" });
    } catch (error) {
      checkoutWindow?.close();
      setValidationMessage(
        error.message || t("Не удалось создать платёж"),
      );
      setPaymentLoading(false);
    }
  }

  function renderPlatformStep() {
    const hasMaxSlot = !isMainPage && visiblePlatforms.some(isMorePlatformsSlot);

    return (
      <div className="wizard-step-content wizard-platform-step">
        <WizardHeading
          step={1}
          title={t("Выберите площадку")}
        />

        <div className="wizard-platform-grid">
          {visiblePlatforms.map((item) => {
            if (!isMainPage && isMorePlatformsSlot(item)) {
              return (
                <button
                  className="wizard-more-platforms"
                  key={`more-platforms-${item}`}
                  type="button"
                  onClick={() => navigate(CATALOG_ROUTE)}
                >
                  <span>+</span>
                  <strong>{t("Больше соцсетей")}</strong>
                  <small>{t("в каталоге")}</small>
                </button>
              );
            }

            const icon = platformIcon(item);

            return (
              <button
                className={platform === item ? "active" : ""}
                key={item}
                type="button"
                onClick={() => selectPlatform(item)}
              >
                <span>
                  {icon ? (
                    <img src={icon} alt="" />
                  ) : (
                    t(displayPlatform(item).slice(0, 2))
                  )}
                </span>
                <strong>{t(displayPlatform(item))}</strong>
              </button>
            );
          })}

          {!isMainPage && !hasMaxSlot && (
            <button
              className="wizard-more-platforms"
              type="button"
              onClick={() => navigate(CATALOG_ROUTE)}
            >
              <span>+</span>
              <strong>{t("Больше соцсетей")}</strong>
              <small>{t("в каталоге")}</small>
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderTypeStep() {
    return (
      <div className="wizard-step-content">
        <WizardHeading
          step={2}
          title={t("Что нужно продвинуть?")}
        />

        <div className="wizard-type-grid">
          {availableTypes.map((item) => {
            const typeIcon = serviceTypeIcons[item];

            return (
              <button
                className={
                  serviceType === item ? "active" : ""
                }
                key={item}
                type="button"
                onClick={() => selectType(item)}
              >
                <span className="wizard-type-icon">
                  {typeIcon ? (
                    <img src={typeIcon} alt="" />
                  ) : (
                    "✦"
                  )}
                </span>

                <strong>{t(displayServiceType(item))}</strong>

                <small>
                  {
                    platformServices.filter(
                      (service) =>
                        itemServiceType(service) === item,
                    ).length
                  }{" "}
                  {t("вариантов")}
                </small>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderServiceStep() {
    return (
      <div className="wizard-step-content wizard-service-step">
        <div className="wizard-service-rate-label">{t("Цена за 1000")}</div>

        <WizardHeading
          step={3}
          title={t("Выберите услугу")}
        />

        <div className="wizard-service-list">
          {concreteServices.map((item) => {
            const itemId = providerServiceId(item);
            const itemName = cleanServiceName(item.name);
            const itemTypeLabel = displayServiceType(itemServiceType(item));
            /* Под названием показываем скорость/вариант услуги, а если её нет —
               вид услуги, и только когда он не дублирует название. */
            const itemSpeedLabel = serviceSpeedLabel(item.name);
            const itemBottomLabel = itemSpeedLabel
              || (isDuplicateLabel(itemName, itemTypeLabel) ? "" : itemTypeLabel);

            return (
              <button
                className={
                  serviceId === itemId ? "active" : ""
                }
                key={itemId}
                type="button"
                onClick={() => selectConcreteService(item)}
              >
                <span className="wizard-service-copy">
                  <strong>
                    {t(itemName)}
                  </strong>

                  {itemBottomLabel && (
                    <span className="wizard-service-details">
                      <small>
                        {t(itemBottomLabel)}
                      </small>
                    </span>
                  )}
                </span>

                <span className="wizard-service-price">
                  <strong>
                    {formatMoney(serviceRate(item))} ₽
                  </strong>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderParametersStep() {
    const platformLogo = platformIcon(platform);

    return (
      <div className="wizard-step-content wizard-parameters-step">
        <WizardHeading step={4} title={t("Дополнительные параметры")} />

        {/* Сначала ссылка, затем количество: поле с кнопкой «Подтвердить»,
            ползунок до максимума и быстрые суммы. */}
        <div className="wizard-quantity-panel">
          <section className="wizard-section">
            <div className="wizard-quantity-row">
              <input
                className="wizard-link-input"
                type="url"
                value={recipientLink}
                onChange={(event) => {
                  setRecipientLink(event.target.value);
                  setValidationMessage("");
                }}
                placeholder={t("Вставьте ссылку")}
                aria-label={t("Ссылка на аккаунт или пост")}
                autoComplete="url"
              />

              {/* Название и логотип площадки справа от поля. */}
              <span className="wizard-link-platform">
                {platformLogo ? (
                  <img src={platformLogo} alt="" aria-hidden="true" />
                ) : null}
                {platform ? t(displayPlatform(platform)) : t("Площадка")}
              </span>
            </div>
          </section>

          <section className="wizard-section">
            <div className="wizard-quantity-row">
              <input
                id="wizard-quantity-input"
                type="number"
                min={0}
                max={quantityMax}
                step={quantityStep}
                value={quantityInput}
                placeholder={t("Введите количество")}
                inputMode="numeric"
                pattern="[0-9]*"
                onKeyDown={(event) => {
                  /* Буквы и знаки не пропускаем — только цифры. */
                  if (
                    event.key.length === 1 &&
                    !/[0-9]/.test(event.key) &&
                    !event.ctrlKey &&
                    !event.metaKey
                  ) {
                    event.preventDefault();
                  }
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  changeQuantityInput(
                    event.clipboardData.getData("text").replace(/\D/g, "")
                  );
                }}
                onChange={(event) =>
                  changeQuantityInput(event.target.value)
                }
                onFocus={(event) => event.target.select()}
                onBlur={normalizeQuantity}
              />

              <button
                className="wizard-next-step"
                type="button"
                onClick={goToNextStep}
                disabled={!quantityValid || !linkValid}
              >
                {t("Подтвердить")}
              </button>
            </div>

            {/* Ползунок количества: деления считаются от максимума услуги. */}
            <AmountSlider
              min={0}
              max={quantityMax}
              step={quantityStep}
              value={Math.min(quantityMax, Math.max(0, quantity))}
              onChange={(nextValue) => changeQuantity(nextValue)}
            />

            <div className="wizard-quantity-quick-actions" aria-label={t("Быстрый выбор количества")}>
              {quickQuantityOptions.map((option) => {
                const isAvailable = option >= quantityMin && option <= quantityMax;

                return (
                  <button
                    key={option}
                    className={quantity === option ? "active" : ""}
                    type="button"
                    disabled={!isAvailable}
                    aria-pressed={quantity === option}
                    onClick={() => changeQuantity(option)}
                  >
                    {option.toLocaleString("ru-RU")}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {validationMessage && (
          <p className="wizard-error" role="alert">
            {validationMessage}
          </p>
        )}

      </div>
    );
  }

  function renderPaymentStep() {
    return (
      <div className="wizard-step-content wizard-payment-step">
        <WizardHeading
          step={5}
          title={t("Способ оплаты")}
        />

        <div
          className="payment-method-list"
          role="radiogroup"
          aria-label={t("Способ оплаты")}
        >
          {paymentMethods.map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              selected={paymentMethod === method.id}
              onSelect={setPaymentMethod}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderSummary() {
    const icon = platform ? platformIcon(platform) : null;
    const selectedPaymentName =
      paymentMethods.find((method) => method.id === paymentMethod)?.name || "";

    return (
      <aside
        className="wizard-summary"
        aria-labelledby="order-summary-title"
      >
        <div className="wizard-summary-heading">
          <p>{t("Ваш заказ")}</p>
          <h2 id="order-summary-title">
            {t("Итог заказа")}
          </h2>
        </div>

        <div className="wizard-summary-content">
          <div className="wizard-summary-service">
            <small>{t("Площадка")}</small>

            <span className={!platform ? "is-empty" : ""}>
              {platform ? (
                icon ? (
                  <img src={icon} alt="" />
                ) : (
                  t(displayPlatform(platform).slice(0, 2))
                )
              ) : null}
            </span>
          </div>

          <dl>
            <div>
              <dt>{t("Тип услуги")}</dt>
              <dd className={!serviceType ? "wizard-summary-value-empty" : ""}>
                {serviceType ? t(displayServiceType(serviceType)) : "—"}
              </dd>
            </div>

            <div>
              <dt>{t("Услуга")}</dt>
              <dd className={!selectedService ? "wizard-summary-value-empty" : ""}>
                {selectedService
                  ? t(cleanServiceName(selectedService.name))
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>{t("Цена за 1000")}</dt>
              <dd className={!selectedService ? "wizard-summary-value-empty" : ""}>
                {selectedService
                  ? `${formatMoney(serviceRate(selectedService))} ₽`
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>{t("Количество")}</dt>
              <dd
                className={
                  !quantityTouched || !quantityValid
                    ? "wizard-summary-value-empty"
                    : ""
                }
              >
                {quantityTouched && quantityValid
                  ? quantity.toLocaleString("ru-RU")
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>{t("Оплата")}</dt>
              <dd className={step !== 4 ? "wizard-summary-value-empty" : ""}>
                {step === 4 && selectedPaymentName
                  ? t(selectedPaymentName)
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="wizard-summary-error-slot">
            {validationMessage && step === 4 ? (
              <p
                className="wizard-error wizard-summary-error"
                role="alert"
              >
                {validationMessage}
              </p>
            ) : null}
          </div>

          <div className="wizard-summary-footer">
            <div className="wizard-summary-total">
              <span>{t("Итого")}</span>
              <strong
                className={
                  !quantityTouched || !quantityValid
                    ? "wizard-summary-value-empty"
                    : ""
                }
              >
                {quantityTouched && quantityValid
                  ? `${formatMoney(total)} ₽`
                  : "—"}
              </strong>
            </div>

            <button
              className="wizard-primary wizard-pay"
              type="button"
              onClick={payOrder}
              disabled={!canPay}
            >
              {paymentLoading
                ? t("Создаём платёж…")
                : t("Оплатить")}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="order-page">
      <section className={`order-wizard order-wizard--step-${step}`}>
        <div className="wizard-layout">
          <div className="wizard-main">
            <header className="wizard-topline">
              <div>
                <p>{t("Быстрый заказ")}</p>
                <h1>{t("Оформление заказа")}</h1>
              </div>

              <div
                className="wizard-progress"
                aria-label={t("Прогресс оформления")}
              >
                {steps.map((item, index) => (
                  <button
                    key={item.id}
                    className={`${index === step ? "active" : ""
                      } ${index < step ? "done" : ""
                      }`}
                    type="button"
                    disabled={
                      index > maxAvailableStep
                    }
                    onClick={() =>
                      index <= maxAvailableStep &&
                      setStep(index)
                    }
                  >
                    <span>
                      {index + 1}
                    </span>
                    <small>{t(item.label)}</small>
                  </button>
                ))}
              </div>
            </header>

            {loadState === "loading" && (
              <div className="wizard-state">
                {t("Загружаем актуальные услуги…")}
              </div>
            )}

            {loadState === "error" && (
              <div className="wizard-state wizard-state--error">
                {t("Каталог временно недоступен. Обновите страницу.")}
                <button
                  className="kp-button kp-button--small"
                  type="button"
                  onClick={retryPrices}
                >
                  {t("Повторить")}
                </button>
              </div>
            )}

            {loadState === "ready" && (
              <div className="wizard-body">
                {step === 0 &&
                  renderPlatformStep()}
                {step === 1 &&
                  renderTypeStep()}
                {step === 2 &&
                  renderServiceStep()}
                {step === 3 &&
                  renderParametersStep()}
                {step === 4 &&
                  renderPaymentStep()}
              </div>
            )}

            {step > 0 &&
              loadState === "ready" && (
                <button
                  className="wizard-back"
                  type="button"
                  onClick={() => {
                    setValidationMessage("");
                    setStep(
                      (current) => current - 1,
                    );
                  }}
                >
                  {t("Назад")}
                </button>
              )}
          </div>

          {renderSummary()}
        </div>
      </section>

      {isAuthModalOpen && (
        <Modal title={t("Авторизация")} onClose={() => setIsAuthModalOpen(false)}>
          <HeroRegisterForm />
        </Modal>
      )}
    </div>
  );
}

export default OrderPage;
