import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import HeroRegisterForm from "../../Hero/HeroRegisterForm";
import commentsIcon from "../../../../../assets/icons/comments.png";
import friendsIcon from "../../../../../assets/icons/friends.png";
import historyIcon from "../../../../../assets/icons/history.png";
import likesIcon from "../../../../../assets/icons/likes.png";
import listeningIcon from "../../../../../assets/icons/listening.png";
import pollsIcon from "../../../../../assets/icons/opros.png";
import podcastsIcon from "../../../../../assets/icons/podcasts.png";
import repostIcon from "../../../../../assets/icons/repost.png";
import saveIcon from "../../../../../assets/icons/save.png";
import showIcon from "../../../../../assets/icons/show.png";
import statsIcon from "../../../../../assets/icons/stats.png";
import subscribeIcon from "../../../../../assets/icons/subscribe.png";
import translationIcon from "../../../../../assets/icons/translation.png";
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
} from "../../../../../ui/catalogMeta";
import {
  clearPendingCheckoutDraft,
  savePendingCheckoutDraft,
} from "../../../../../ui/orderDraft";
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
    caption: "Оплата через ЮKassa по QR-коду или в приложении банка",
    mark: "QR",
  },
  {
    id: "crystalpay",
    name: "CrystalPAY",
    caption: "Оплата картой, криптовалютой или другим доступным способом",
    mark: "CP",
  },
];

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

function apiError(data, fallback) {
  return typeof data?.detail === "string" ? data.detail : fallback;
}

function WizardHeading({ step, title, description }) {
  return (
    <div className="wizard-heading">
      <div className="wizard-heading-meta">
        <span>Шаг {step}</span>
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function OrderPage({ initialDraft = null, onCheckoutRestored }) {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredDraftRef = useRef(false);

  const [prices, setPrices] = useState([]);
  const [loadState, setLoadState] = useState("loading");
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

    fetch(`${API_URL}/price`)
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok || !data?.success || !Array.isArray(data.items)) {
          throw new Error("Не удалось загрузить актуальный каталог");
        }

        if (active) {
          setPrices(data.items);
          setLoadState("ready");
        }
      })
      .catch(() => active && setLoadState("error"));

    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    if (!isAuthModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const close = (event) =>
      event.key === "Escape" && setIsAuthModalOpen(false);

    window.addEventListener("keydown", close);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [isAuthModalOpen]);

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
        "Сохранённая услуга больше недоступна. Выберите актуальный вариант.",
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

  const sliderProgress =
    selectedService && quantityMax > 0
      ? ((Math.min(
        quantityMax,
        Math.max(0, quantity),
      ) -
        0) /
        quantityMax) *
      100
      : 0;

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

  function normalizeQuantity() {
    if (!selectedService) return;

    const enteredValue = Number(quantity);
    if (enteredValue === 0) return;

    const safeValue = Math.min(
      quantityMax,
      Math.max(quantityMin, enteredValue || quantityMin),
    );

    const normalizedValue = Math.round(safeValue);

    setQuantity(normalizedValue);
    setQuantityTouched(true);
    setValidationMessage("");
  }

  function goToNextStep() {
    if (!selectedService) {
      setValidationMessage("Сначала выберите услугу");
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < quantityMin ||
      quantity > quantityMax
    ) {
      setValidationMessage(
        `Введите целое количество от ${quantityMin} до ${quantityMax}`,
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

  function handleAuthSuccess() {
    setIsAuthModalOpen(false);

    navigate("/main", {
      replace: true,
      state: {
        section: "create",
        resumeCheckout: true,
      },
    });
  }

  async function payOrder() {
    if (!selectedService || paymentLoading) return;

    if (!quantityValid) {
      setValidationMessage(
        `Введите целое количество от ${quantityMin} до ${quantityMax}`,
      );
      return;
    }

    if (!recipientLink.trim()) {
      setValidationMessage(
        "Введите ссылку на страницу, публикацию или канал",
      );
      return;
    }

    if (!linkValid) {
      setValidationMessage(
        "Введите корректную ссылку на страницу или публикацию",
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
          apiError(data, "Не удалось создать платёж"),
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
      navigate("/payment/pending?attempt=" + data.attempt_id);
    } catch (error) {
      checkoutWindow?.close();
      setValidationMessage(
        error.message || "Не удалось создать платёж",
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
          title="Выберите площадку"
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
                  <strong>Больше соцсетей</strong>
                  <small>в каталоге</small>
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
                    displayPlatform(item).slice(0, 2)
                  )}
                </span>
                <strong>{displayPlatform(item)}</strong>
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
              <strong>Больше соцсетей</strong>
              <small>в каталоге</small>
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
          title="Что нужно продвинуть?"
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

                <strong>{displayServiceType(item)}</strong>

                <small>
                  {
                    platformServices.filter(
                      (service) =>
                        itemServiceType(service) === item,
                    ).length
                  }{" "}
                  вариантов
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
        <div className="wizard-service-rate-label">Цена за 1000</div>

        <WizardHeading
          step={3}
          title="Выберите услугу"
        />

        <div className="wizard-service-list">
          {concreteServices.map((item) => {
            const itemId = providerServiceId(item);

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
                    {cleanServiceName(item.name)}
                  </strong>

                  <span className="wizard-service-details">
                    <small>
                      {displayServiceType(
                        itemServiceType(item),
                      )}
                    </small>
                  </span>
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
    return (
      <div className="wizard-step-content">
        <WizardHeading
          step={4}
          title="Количество"
          description="Введите значение вручную или используйте ползунок"
        />

        <div className="wizard-quantity-panel">
          <div className="wizard-quantity-top">
            <label htmlFor="wizard-quantity-input">
              Количество
            </label>

            <input
              id="wizard-quantity-input"
              type="number"
              min={0}
              max={quantityMax}
              step={quantityStep}
              value={quantity}
              onChange={(event) =>
                changeQuantity(event.target.value)
              }
              onBlur={normalizeQuantity}
            />
          </div>

          <input
            className="wizard-range"
            type="range"
            min={0}
            max={quantityMax}
            step={quantityStep}
            value={Math.min(quantityMax, Math.max(0, quantity))}
            style={{
              "--wizard-range-progress": `${sliderProgress}%`,
            }}
            onChange={(event) =>
              changeQuantity(event.target.value)
            }
          />

          <div className="wizard-range-values">
            <span>
              0
            </span>
            <span>
              {quantityMax.toLocaleString("ru-RU")}
            </span>
          </div>

          <button
            className="wizard-next-step"
            type="button"
            onClick={goToNextStep}
            disabled={!quantityValid}
          >
            К следующему шагу
          </button>
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
          title="Способ оплаты"
        />

        <div
          className="wizard-payment-method-grid wizard-payment-method-grid--standalone"
          aria-labelledby="payment-methods-title"
        >
          {paymentMethods.map((method) => (
            <button
              className={`wizard-payment-method ${paymentMethod === method.id ? "active" : ""
                }`}
              key={method.id}
              type="button"
              aria-pressed={paymentMethod === method.id}
              onClick={() => setPaymentMethod(method.id)}
            >
              <span>{method.mark}</span>

              <div>
                <strong>{method.name}</strong>
                <small>{method.caption}</small>
              </div>

              <i aria-hidden="true">
                {paymentMethod === method.id ? "✓" : ""}
              </i>
            </button>
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
          <p>Ваш заказ</p>
          <h2 id="order-summary-title">
            Итог заказа
          </h2>
        </div>

        <div className="wizard-summary-content">
          <div className="wizard-summary-service">
            <span className={!platform ? "is-empty" : ""}>
              {platform ? (
                icon ? (
                  <img src={icon} alt="" />
                ) : (
                  displayPlatform(platform).slice(0, 2)
                )
              ) : null}
            </span>

            <div>
              <small>Площадка</small>
              <strong className={!platform ? "wizard-summary-value-empty" : ""}>
                {platform ? displayPlatform(platform) : "—"}
              </strong>
            </div>
          </div>

          <dl>
            <div>
              <dt>Тип услуги</dt>
              <dd className={!serviceType ? "wizard-summary-value-empty" : ""}>
                {serviceType ? displayServiceType(serviceType) : "—"}
              </dd>
            </div>

            <div>
              <dt>Услуга</dt>
              <dd className={!selectedService ? "wizard-summary-value-empty" : ""}>
                {selectedService
                  ? cleanServiceName(selectedService.name)
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>Цена за 1000</dt>
              <dd className={!selectedService ? "wizard-summary-value-empty" : ""}>
                {selectedService
                  ? `${formatMoney(serviceRate(selectedService))} ₽`
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>Количество</dt>
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
              <dt>Оплата</dt>
              <dd className={step !== 4 ? "wizard-summary-value-empty" : ""}>
                {step === 4 && selectedPaymentName
                  ? selectedPaymentName
                  : "—"}
              </dd>
            </div>
          </dl>

          <div
            className={`wizard-summary-link ${quantityTouched && quantityValid ? "active" : ""
              }`}
          >
            <input
              className="wizard-link-input"
              type="url"
              value={recipientLink}
              disabled={!quantityTouched || !quantityValid}
              onChange={(event) => {
                setRecipientLink(event.target.value);
                setValidationMessage("");
              }}
              placeholder="Вставьте ссылку"
              autoComplete="url"
            />
          </div>

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
              <span>Итого</span>
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
                ? "Создаём платёж…"
                : "Оплатить"}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="order-page">
      <section className="order-wizard">
        <div className="wizard-layout">
          <div className="wizard-main">
            <header className="wizard-topline">
              <div>
                <p>Быстрый заказ</p>
                <h1>Оформление заказа</h1>
              </div>

              <div
                className="wizard-progress"
                aria-label="Прогресс оформления"
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
                      {index < step
                        ? "✓"
                        : index + 1}
                    </span>
                    <small>{item.label}</small>
                  </button>
                ))}
              </div>
            </header>

            {loadState === "loading" && (
              <div className="wizard-state">
                Загружаем актуальные услуги…
              </div>
            )}

            {loadState === "error" && (
              <div className="wizard-state wizard-state--error">
                Каталог временно недоступен.
                Обновите страницу.
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
                  Назад
                </button>
              )}
          </div>

          {renderSummary()}
        </div>
      </section>

      {isAuthModalOpen && (
        <div
          className="wizard-auth-overlay"
          role="presentation"
          onMouseDown={(event) =>
            event.target ===
            event.currentTarget &&
            setIsAuthModalOpen(false)
          }
        >
          <section
            className="wizard-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-auth-title"
          >
            <button
              className="wizard-auth-close"
              type="button"
              onClick={() =>
                setIsAuthModalOpen(false)
              }
              aria-label="Закрыть"
            >
              ×
            </button>

            <p className="kp-eyebrow">
              Черновик сохранён
            </p>

            <h2 id="wizard-auth-title">
              Войдите, чтобы продолжить
            </h2>

            <p>
              После авторизации заказ откроется в
              личном кабинете.
            </p>

            <HeroRegisterForm
              onAuthSuccess={handleAuthSuccess}
            />
          </section>
        </div>
      )}
    </div>
  );
}

export default OrderPage;
