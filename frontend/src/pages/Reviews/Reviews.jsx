import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, EmptyState, PageHeader } from "../../ui/AppShell";
import { useLanguage } from "../../ui/i18n";
import Modal from "../../ui/Modal";
import Footer from "../Landing/components/Footer/Footer";
import HeroRegisterForm from "../Landing/components/Hero/HeroRegisterForm";
import ReviewCard, { ReviewsSkeleton } from "./components/ReviewCard";
import ReviewForm from "./components/ReviewForm";
import ReviewsStats from "./components/ReviewsStats";
import { getMyReview, getReviews, getReviewStats } from "./reviewsApi";
import "./Reviews.css";

export default function Reviews({ isAuthenticated }) {
    const { t } = useLanguage();
    const [sort, setSort] = useState("newest");
    const [revision, setRevision] = useState(0);
    const [items, setItems] = useState([]);
    const [stats, setStats] = useState(null);
    const [nextOffset, setNextOffset] = useState(null);
    const [status, setStatus] = useState("loading");
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState(false);
    const [myReview, setMyReview] = useState(null);
    const [ownStatus, setOwnStatus] = useState("loading");
    const [modal, setModal] = useState(null);
    const [notice, setNotice] = useState("");
    const requests = useRef({ generation: 0, more: false });

    useEffect(() => {
        const controller = new AbortController();
        const generation = ++requests.current.generation;
        requests.current.more = false;
        setStatus("loading"); setLoadingMore(false); setMoreError(false);
        Promise.all([getReviews(sort, 0, controller.signal), getReviewStats(controller.signal)])
            .then(([page, summary]) => {
                if (generation !== requests.current.generation) return;
                setItems(page.items); setNextOffset(page.next_offset); setStats(summary); setStatus("ready");
            })
            .catch((error) => {
                if (error.name !== "AbortError" && generation === requests.current.generation) setStatus("error");
            });
        return () => { controller.abort(); requests.current.generation++; };
    }, [sort, revision]);

    useEffect(() => {
        if (!isAuthenticated) {
            setMyReview(null); setOwnStatus("ready");
            setModal((current) => current === "review" ? "prompt" : current);
            return;
        }
        const controller = new AbortController();
        setOwnStatus("loading");
        getMyReview(controller.signal).then((review) => {
            setMyReview(review); setOwnStatus("ready");
        }).catch((error) => {
            if (error.name !== "AbortError") setOwnStatus("error");
        });
        return () => controller.abort();
    }, [isAuthenticated, revision]);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(""), 7000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const afterAuth = useCallback(() => {
        setModal(null); setRevision((value) => value + 1);
        setNotice(t("Вы вошли в аккаунт. Теперь можно оставить отзыв."));
    }, [t]);

    async function loadMore() {
        if (requests.current.more || nextOffset === null) return;
        const generation = requests.current.generation;
        requests.current.more = true; setLoadingMore(true); setMoreError(false);
        try {
            const page = await getReviews(sort, nextOffset);
            if (generation !== requests.current.generation) return;
            setItems((current) => {
                const ids = new Set(current.map((item) => item.id));
                return [...current, ...page.items.filter((item) => !ids.has(item.id))];
            });
            setNextOffset(page.next_offset);
        } catch {
            if (generation === requests.current.generation) setMoreError(true);
        } finally {
            if (generation === requests.current.generation) {
                requests.current.more = false; setLoadingMore(false);
            }
        }
    }

    return <div className="reviews-page-shell">
        <AppShell active="reviews" onLogin={() => setModal("auth")} contentClassName="reviews-page" title={t("Отзывы наших клиентов")}>
            <PageHeader eyebrow={t("KingPromotion · Отзывы")} description={t("Реальный опыт пользователей KingPromotion. Делитесь впечатлениями и помогайте нам становиться лучше.")} />
            {isAuthenticated && ownStatus === "error" && <p role="alert" className="reviews-inline-error">{t("Не удалось проверить ваш отзыв. Обновите страницу.")}</p>}
            <div className="reviews-top">
                {/* Левая колонка: общий рейтинг и под ним список отзывов. */}
                <div className="reviews-main">
                    {status === "ready" && <ReviewsStats stats={stats} />}

                    <section aria-labelledby="reviews-list-title">
                        <div className="reviews-toolbar">
                            <h2 id="reviews-list-title">{t("Опыт наших клиентов")}</h2>
                            <label className="reviews-sort"><span>{t("Сортировка")}</span><select className="kp-field" value={sort} onChange={(event) => setSort(event.target.value)}>
                                <option value="newest">{t("Сначала новые")}</option><option value="oldest">{t("Сначала старые")}</option><option value="highest">{t("С высокой оценкой")}</option><option value="lowest">{t("С низкой оценкой")}</option>
                            </select></label>
                        </div>
                        {status === "loading" && <ReviewsSkeleton />}
                        {status === "error" && <EmptyState><h3>{t("Не удалось загрузить отзывы")}</h3><p>{t("Попробуйте ещё раз чуть позже.")}</p><button className="kp-button kp-button--secondary" type="button" onClick={() => setRevision((value) => value + 1)}>{t("Попробовать снова")}</button></EmptyState>}
                        {status === "ready" && (items.length ? <>
                            <div className="reviews-grid">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</div>
                            <div className="reviews-more" aria-live="polite">
                                {moreError && <p role="alert">{t("Не удалось загрузить следующую страницу. Попробуйте ещё раз.")}</p>}
                                {nextOffset !== null && <button className="kp-button kp-button--secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("Загружаем…") : moreError ? t("Попробовать снова") : t("Показать ещё")}</button>}
                                <span className="reviews-loaded">{t("Показано {shown} из {total}", { shown: items.length, total: stats.total })}</span>
                            </div>
                        </> : <EmptyState><h3>{t("Пока нет отзывов")}</h3><p>{t("Станьте первым, кто поделится своим опытом.")}</p></EmptyState>)}
                    </section>
                </div>

                <ReviewForm
                    key={myReview?.id || "new"}
                    review={myReview}
                    onUnauthorized={() => setModal("prompt")}
                    onConflict={() => setRevision((value) => value + 1)}
                    onSaved={(review, edited) => {
                        setMyReview(review);
                        setNotice(edited ? t("Спасибо! Ваш отзыв обновлён.") : t("Спасибо! Ваш отзыв опубликован."));
                        setRevision((value) => value + 1);
                    }}
                />
            </div>
        </AppShell>
        {notice && <div className="reviews-notice kp-status kp-status--success" role="status"><i />{notice}</div>}
        {modal === "prompt" && <Modal title={t("Войдите в аккаунт")} onClose={() => setModal(null)} className="reviews-modal">
            <div className="review-form"><h2>{t("Войдите в аккаунт")}</h2><p>{t("Чтобы оставить отзыв, необходимо войти в аккаунт.")}</p><div className="reviews-dialog-actions"><button className="kp-button" type="button" onClick={() => setModal("auth")}>{t("Войти")}</button><button className="kp-button kp-button--secondary" type="button" onClick={() => setModal(null)}>{t("Отмена")}</button></div></div>
        </Modal>}
        {modal === "auth" && <Modal title={t("Авторизация")} onClose={() => setModal(null)}><HeroRegisterForm onAuthSuccess={afterAuth} /></Modal>}
    </div>;
}
