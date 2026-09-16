import { Panel } from "../../../ui/AppShell";
import StarRating from "./StarRating";

export function reviewCount(count) {
    const form = new Intl.PluralRules("ru").select(count);
    return `${count.toLocaleString("ru-RU")} ${{ one: "отзыв", few: "отзыва", many: "отзывов", other: "отзыва" }[form]}`;
}

export default function ReviewsStats({ stats }) {
    return <Panel className="reviews-stats" aria-label="Общий рейтинг">
        <div className="reviews-average">
            <span className="reviews-stat-caption">Общий рейтинг</span>
            <div><strong>{stats.average === null ? "—" : stats.average.toFixed(1)}</strong><StarRating value={stats.average || 0} /></div>
            <span>{stats.total ? `Всего ${reviewCount(stats.total)}` : "Пока без оценок"}</span>
        </div>
        <div className="reviews-distribution">
            {[5, 4, 3, 2, 1].map((rating) => {
                const percent = stats.total ? Math.round(stats.distribution[rating] / stats.total * 100) : 0;
                return <div key={rating} aria-label={`${rating} из 5: ${percent}%`}><span>{rating}</span><span className="review-rating-bar"><i style={{ width: `${percent}%` }} /></span><span>{percent}%</span></div>;
            })}
        </div>
    </Panel>;
}
