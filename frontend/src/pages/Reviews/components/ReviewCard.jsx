import { useState } from "react";
import { Panel } from "../../../ui/AppShell";
import { useLanguage } from "../../../ui/i18n";
import StarRating from "./StarRating";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default function ReviewCard({ review }) {
    const [failedAvatar, setFailedAvatar] = useState(false);
    const { user } = review;
    const avatar = /^https?:\/\//i.test(user.avatar_url || "") ? user.avatar_url : null;
    return <Panel as="article" className="review-card">
        <header className="review-card-header">
            <span className="review-avatar" aria-hidden="true">
                {avatar && !failedAvatar ? <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedAvatar(true)} /> : user.login.slice(0, 1).toLocaleUpperCase("ru-RU")}
            </span>
            <div className="review-author"><h3>{user.login}</h3><time dateTime={review.created_at}>{dateFormat.format(new Date(review.created_at))}</time></div>
            <StarRating value={review.rating} />
        </header>
        <p className="review-text">{review.text}</p>
    </Panel>;
}

export function ReviewsSkeleton() {
    const { t } = useLanguage();
    return <div className="reviews-grid" role="status" aria-label={t("Загружаем отзывы")}>
        {Array.from({ length: 6 }, (_, i) => <div className="review-card review-skeleton" key={i} aria-hidden="true"><div className="review-skeleton-head" /><div /><div /><div /></div>)}
    </div>;
}
