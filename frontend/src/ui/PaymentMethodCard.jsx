import { useLanguage } from "./i18n";
import "./PaymentMethodCard.css";

/* Карточка способа оплаты — общая для пополнения баланса и панели заказа,
   поэтому оба места выглядят одинаково. */
export default function PaymentMethodCard({ method, selected, onSelect }) {
    const { t } = useLanguage();
    const description = method.description || method.caption || "";

    return (
        <button
            className={`payment-method-card ${selected ? "is-selected" : ""}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(method.id)}
        >
            <span className="payment-method-logo" aria-hidden="true">
                {method.icon ? (
                    <img src={method.icon} alt="" />
                ) : method.mark ? (
                    <strong className="payment-method-mark">{t(method.mark)}</strong>
                ) : (
                    <><i /><i /><i /></>
                )}
            </span>
            <span className="payment-method-copy">
                <span className="payment-method-heading">
                    <strong>{t(method.name)}</strong>
                    {method.badge && <small>{t(method.badge)}</small>}
                </span>
                {description && <span>{t(description)}</span>}
                {method.provider && <em>{t("Платёж обрабатывает")} {t(method.provider)}</em>}
            </span>
            <span className="payment-method-check" aria-hidden="true">✓</span>
        </button>
    );
}
