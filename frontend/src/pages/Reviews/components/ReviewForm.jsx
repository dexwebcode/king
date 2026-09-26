import { useRef, useState } from "react";

import { Panel } from "../../../ui/AppShell";
import { useLanguage } from "../../../ui/i18n";
import StarRating from "./StarRating";
import { saveReview } from "../reviewsApi";

/* Форма отзыва. Показывается прямо на странице отзывов — справа от статистики. */
export default function ReviewForm({ review, onSaved, onUnauthorized, onConflict }) {
    const { t } = useLanguage();
    const [rating, setRating] = useState(review?.rating || 0);
    const [text, setText] = useState(review?.text || "");
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    const form = useRef(null);
    const length = [...text.trim()].length;

    async function submit(event) {
        event.preventDefault();
        if (submitting.current) return;
        const nextErrors = {};
        if (!rating) nextErrors.rating = t("Выберите оценку от 1 до 5.");
        if (length < 10 || length > 1000) nextErrors.text = t("Напишите от 10 до 1000 символов, не считая пробелов по краям.");
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            form.current.querySelector(nextErrors.rating ? 'input[type="radio"]' : "textarea").focus();
            return;
        }
        submitting.current = true;
        setBusy(true);
        try {
            const saved = await saveReview({ rating, text: text.trim() }, Boolean(review));
            onSaved(saved, Boolean(review));
        } catch (error) {
            if (error.status === 401) onUnauthorized();
            else if (error.status === 409) {
                setErrors({ form: t("Вы уже оставили отзыв — отредактируйте его в этой форме.") });
                onConflict();
            } else setErrors({ form: t("Не удалось сохранить отзыв. Попробуйте ещё раз.") });
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }

    return <Panel as="section" className="review-form-panel" aria-label={review ? t("Редактировать отзыв") : t("Оставить отзыв")}>
        <form ref={form} onSubmit={submit} noValidate className="review-form">
            <h2>{review ? t("Редактировать отзыв") : t("Ваш отзыв")}</h2>
            <p className="review-form-intro">{t("Поделитесь своим опытом — это поможет нам стать лучше.")}</p>
            <span className="review-field-label">{t("Ваша оценка")}</span>
            <StarRating value={rating} onChange={setRating} disabled={busy} describedBy={errors.rating ? "review-rating-error" : undefined} />
            {errors.rating && <p className="Password-hint" id="review-rating-error">{errors.rating}</p>}
            <label className="review-field-label" htmlFor="review-text">{t("Ваш опыт")}</label>
            <textarea id="review-text" className="kp-field" value={text} onChange={(event) => setText(event.target.value)} disabled={busy} rows={6} placeholder={t("Расскажите о вашем опыте использования KingPromotion")} aria-invalid={Boolean(errors.text)} aria-describedby={`review-counter${errors.text ? " review-text-error" : ""}`} />
            <div className="review-text-meta"><span>{t("От 10 до 1000 символов")}</span><span id="review-counter">{length} / 1000</span></div>
            {errors.text && <p className="Password-hint" id="review-text-error">{errors.text}</p>}
            {errors.form && <p className="Password-hint" role="alert">{errors.form}</p>}
            <button type="submit" className="kp-button kp-button--form" disabled={busy || !rating || !length}>{busy ? t("Сохраняем…") : review ? t("Сохранить изменения") : t("Опубликовать отзыв")}</button>
        </form>
    </Panel>;
}
