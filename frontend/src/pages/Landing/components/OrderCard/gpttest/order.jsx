import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import HeroRegisterForm from "../../Hero/HeroRegisterForm";
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
import "./order.css";


const API_URL = import.meta.env.VITE_API_URL || "";
const ORDER_PREFILL_KEY = "king_order_prefill";
const ORDER_DRAFT_KEY = "king_order_draft";
const steps = [
  { id: "platform", label: "Площадка" },
  { id: "type", label: "Тип" },
  { id: "service", label: "Услуга" },
  { id: "parameters", label: "Параметры" },
  { id: "review", label: "Проверка" },
];


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


function OrderPage({ onDraftSaved }) {
  const navigate = useNavigate();
  const [prices, setPrices] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [recipientLink, setRecipientLink] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const rawPreset = localStorage.getItem(ORDER_PREFILL_KEY);
      if (!rawPreset) return;
      const preset = JSON.parse(rawPreset);
      const nextPlatform = String(preset?.platform || "");
      const nextType = String(preset?.service_type || preset?.service || "");
      const nextServiceId = String(preset?.service_id || "");
      if (!nextPlatform) return;
      setPlatform(nextPlatform);
      setServiceType(nextType);
      setServiceId(nextServiceId);
      if (Number.isFinite(Number(preset.quantity))) {
        setQuantity(Number(preset.quantity));
      }
      setRecipientLink(String(preset.recipient_link || ""));
      setStep(nextServiceId ? 3 : nextType ? 2 : 1);
    } catch {
      localStorage.removeItem(ORDER_PREFILL_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isAuthModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => event.key === "Escape" && setIsAuthModalOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [isAuthModalOpen]);

  const availablePlatforms = useMemo(() => {
    const ids = [...new Set(prices.map((item) => String(item.platform || item.soc || "")).filter(Boolean))];
    return ids.sort((left, right) => {
      const leftIndex = platformOrder.indexOf(left);
      const rightIndex = platformOrder.indexOf(right);
      return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
    });
  }, [prices]);

  const platformServices = useMemo(
    () => prices.filter((item) => String(item.platform || item.soc || "") === platform),
    [platform, prices],
  );
  const availableTypes = useMemo(
    () => [...new Set(platformServices.map(itemServiceType).filter(Boolean))],
    [platformServices],
  );
  const concreteServices = useMemo(
    () => platformServices
      .filter((item) => itemServiceType(item) === serviceType)
      .sort((left, right) => serviceRate(left) - serviceRate(right)),
    [platformServices, serviceType],
  );
  const selectedService = prices.find((item) => providerServiceId(item) === serviceId) || null;
  const quantityMin = Number(selectedService?.min || 1);
  const quantityMax = Number(selectedService?.max || quantityMin);
  const quantityStep = Math.max(1, Number(selectedService?.step || 1));

  useEffect(() => {
    if (!selectedService) return;
    setQuantity((current) => (
      current >= quantityMin && current <= quantityMax ? current : quantityMin
    ));
  }, [selectedService, quantityMin, quantityMax]);

  const total = useMemo(() => {
    if (!selectedService || !quantity) return 0;
    const rate = quantity >= 1000
      ? serviceRate(selectedService)
      : compareServiceRate(selectedService);
    return Math.round((rate * quantity / 1000) * 100) / 100;
  }, [quantity, selectedService]);

  const maxAvailableStep = serviceId ? 4 : serviceType ? 2 : platform ? 1 : 0;

  function selectPlatform(nextPlatform) {
    setPlatform(nextPlatform);
    setServiceType("");
    setServiceId("");
    setQuantity(0);
    setValidationMessage("");
    setStep(1);
  }

  function selectType(nextType) {
    setServiceType(nextType);
    setServiceId("");
    setQuantity(0);
    setValidationMessage("");
    setStep(2);
  }

  function selectConcreteService(item) {
    setServiceId(providerServiceId(item));
    setQuantity(Number(item.min || 1));
    setValidationMessage("");
    setStep(3);
  }

  function continueFromParameters() {
    if (!selectedService) {
      setValidationMessage("Сначала выберите услугу");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < quantityMin || quantity > quantityMax) {
      setValidationMessage(`Введите целое количество от ${quantityMin} до ${quantityMax}`);
      return;
    }
    if (!isValidRecipientLink(recipientLink)) {
      setValidationMessage("Введите корректную ссылку на страницу или публикацию");
      return;
    }
    setValidationMessage("");
    setStep(4);
  }

  function finishOrder() {
    const draft = {
      version: 3,
      service_id: serviceId,
      platform,
      platform_name: displayPlatform(platform),
      service_type: serviceType,
      service_type_name: displayServiceType(serviceType),
      service_name: cleanServiceName(selectedService?.name),
      quantity,
      recipient_link: normalizeRecipientLink(recipientLink),
      display_total: formatMoney(total),
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
    if (localStorage.getItem("token")) {
      if (onDraftSaved) onDraftSaved(draft);
      else navigate("/main", { state: { section: "create" } });
      return;
    }
    setIsAuthModalOpen(true);
  }

  function renderPlatformStep() {
    return (
      <div className="wizard-step-content">
        <div className="wizard-heading"><span>Шаг 1</span><h2>Выберите площадку</h2><p>Где нужно продвижение?</p></div>
        <div className="wizard-platform-grid">
          {availablePlatforms.map((item) => {
            const icon = platformIcon(item);
            return (
              <button className={platform === item ? "active" : ""} key={item} type="button" onClick={() => selectPlatform(item)}>
                <span>{icon ? <img src={icon} alt="" /> : displayPlatform(item).slice(0, 2)}</span>
                <strong>{displayPlatform(item)}</strong>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTypeStep() {
    return (
      <div className="wizard-step-content">
        <div className="wizard-heading"><span>Шаг 2</span><h2>Что нужно продвинуть?</h2><p>{displayPlatform(platform)} · выберите тип услуги</p></div>
        <div className="wizard-type-grid">
          {availableTypes.map((item) => (
            <button className={serviceType === item ? "active" : ""} key={item} type="button" onClick={() => selectType(item)}>
              <span>✦</span><strong>{displayServiceType(item)}</strong>
              <small>{platformServices.filter((service) => itemServiceType(service) === item).length} вариантов</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderServiceStep() {
    return (
      <div className="wizard-step-content">
        <div className="wizard-heading"><span>Шаг 3</span><h2>Выберите услугу</h2><p>{displayPlatform(platform)} · {displayServiceType(serviceType)}</p></div>
        <div className="wizard-service-list">
          {concreteServices.map((item) => {
            const itemId = providerServiceId(item);
            return (
              <button className={serviceId === itemId ? "active" : ""} key={itemId} type="button" onClick={() => selectConcreteService(item)}>
                <span className="wizard-service-copy"><strong>{cleanServiceName(item.name)}</strong><small>от {Number(item.min).toLocaleString("ru-RU")} · до {Number(item.max).toLocaleString("ru-RU")}</small></span>
                <span className="wizard-service-price"><strong>{formatMoney(serviceRate(item))} ₽</strong><small>за 1 000</small></span>
                <span className="wizard-select-label">Выбрать</span>
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
        <div className="wizard-heading"><span>Шаг 4</span><h2>Параметры заказа</h2><p>{cleanServiceName(selectedService?.name)}</p></div>
        <div className="wizard-fields">
          <label><span>Количество</span><div className="wizard-quantity"><button type="button" onClick={() => setQuantity(Math.max(quantityMin, quantity - quantityStep))}>−</button><input type="number" min={quantityMin} max={quantityMax} step={quantityStep} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /><button type="button" onClick={() => setQuantity(Math.min(quantityMax, quantity + quantityStep))}>+</button></div><small>Минимум {quantityMin.toLocaleString("ru-RU")} · максимум {quantityMax.toLocaleString("ru-RU")}</small></label>
          <label><span>Ссылка</span><input className="wizard-link-input" type="url" value={recipientLink} onChange={(event) => setRecipientLink(event.target.value)} placeholder="instagram.com/example" autoComplete="url" /><small>Ссылка на аккаунт, публикацию или канал</small></label>
        </div>
        {validationMessage && <p className="wizard-error" role="alert">{validationMessage}</p>}
        <button className="wizard-primary" type="button" onClick={continueFromParameters}>Проверить заказ <span>→</span></button>
      </div>
    );
  }

  function renderReviewStep() {
    const icon = platformIcon(platform);
    return (
      <div className="wizard-step-content">
        <div className="wizard-heading"><span>Шаг 5</span><h2>Проверьте заказ</h2><p>Backend повторно проверит цену и ограничения перед оплатой</p></div>
        <div className="wizard-review">
          <div className="wizard-review-service"><span>{icon ? <img src={icon} alt="" /> : displayPlatform(platform).slice(0, 2)}</span><div><small>{displayPlatform(platform)} · {displayServiceType(serviceType)}</small><strong>{cleanServiceName(selectedService?.name)}</strong></div></div>
          <dl><div><dt>Количество</dt><dd>{quantity.toLocaleString("ru-RU")}</dd></div><div><dt>Ссылка</dt><dd>{normalizeRecipientLink(recipientLink)}</dd></div><div className="wizard-review-total"><dt>Итого</dt><dd>{formatMoney(total)} ₽</dd></div></dl>
        </div>
        <button className="wizard-primary" type="button" onClick={finishOrder}>Оформить заказ <span>→</span></button>
        <p className="wizard-agreement">Цена на этом экране информационная. Итоговую сумму рассчитывает backend.</p>
      </div>
    );
  }

  return (
    <div className="order-page">
      <section className="order-wizard">
        <header className="wizard-topline">
          <div><p>Быстрый заказ</p><h1>Оформление заказа</h1></div>
          <div className="wizard-progress" aria-label="Прогресс оформления">
            {steps.map((item, index) => (
              <button key={item.id} className={`${index === step ? "active" : ""} ${index < step ? "done" : ""}`} type="button" disabled={index > maxAvailableStep} onClick={() => index <= maxAvailableStep && setStep(index)}>
                <span>{index < step ? "✓" : index + 1}</span><small>{item.label}</small>
              </button>
            ))}
          </div>
        </header>

        {loadState === "loading" && <div className="wizard-state">Загружаем актуальные услуги…</div>}
        {loadState === "error" && <div className="wizard-state wizard-state--error">Каталог временно недоступен. Обновите страницу.</div>}
        {loadState === "ready" && (
          <div className="wizard-body">
            {step === 0 && renderPlatformStep()}
            {step === 1 && renderTypeStep()}
            {step === 2 && renderServiceStep()}
            {step === 3 && renderParametersStep()}
            {step === 4 && renderReviewStep()}
          </div>
        )}

        {step > 0 && loadState === "ready" && (
          <button className="wizard-back" type="button" onClick={() => { setValidationMessage(""); setStep((current) => current - 1); }}>← Назад</button>
        )}
      </section>

      {isAuthModalOpen && (
        <div className="wizard-auth-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setIsAuthModalOpen(false)}>
          <section className="wizard-auth-modal" role="dialog" aria-modal="true" aria-labelledby="wizard-auth-title">
            <button className="wizard-auth-close" type="button" onClick={() => setIsAuthModalOpen(false)} aria-label="Закрыть">×</button>
            <p className="kp-eyebrow">Черновик сохранён</p>
            <h2 id="wizard-auth-title">Войдите, чтобы продолжить</h2>
            <p>После авторизации заказ откроется в личном кабинете.</p>
            <HeroRegisterForm initialMode="login" />
          </section>
        </div>
      )}
    </div>
  );
}

export default OrderPage;
