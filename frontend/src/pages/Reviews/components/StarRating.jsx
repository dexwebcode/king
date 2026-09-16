import { useId, useState } from "react";

function Star({ filled }) {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "is-filled" : ""}><path d="m12 3 2.8 5.67 6.26.91-4.53 4.42 1.07 6.24L12 17.3l-5.6 2.94 1.07-6.24L2.94 9.58l6.26-.91Z" /></svg>;
}

export default function StarRating({ value = 0, onChange, disabled = false, describedBy }) {
    const [hover, setHover] = useState(0);
    const name = useId();
    if (!onChange) return <span className="review-stars" role="img" aria-label={`Оценка ${value} из 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= Math.round(value)} />)}</span>;
    return (
        <div className="review-stars review-stars--input" role="radiogroup" aria-label="Оценка" aria-describedby={describedBy} onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => <label key={n} onMouseEnter={() => !disabled && setHover(n)}>
                <input type="radio" name={name} value={n} aria-label={`${n} из 5`} checked={value === n} disabled={disabled} onChange={() => onChange(n)} />
                <Star filled={n <= (hover || value)} />
            </label>)}
        </div>
    );
}
