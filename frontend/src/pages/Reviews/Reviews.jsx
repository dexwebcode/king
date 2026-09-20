import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell, EmptyState, PageHeader } from "../../ui/AppShell";
import Modal from "../../ui/Modal";
import Footer from "../Landing/components/Footer/Footer";
import HeroRegisterForm from "../Landing/components/Hero/HeroRegisterForm";
import ReviewCard, { ReviewsSkeleton } from "./components/ReviewCard";
import ReviewModal from "./components/ReviewModal";
import ReviewsStats from "./components/ReviewsStats";
import { getMyReview, getReviews, getReviewStats } from "./reviewsApi";
import "./Reviews.css";

export default function Reviews({ isAuthenticated }) {
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
        setNotice("Вы вошли в аккаунт. Теперь можно оставить отзыв.");
    }, []);

    function openReview() {
        if (!isAuthenticated) setModal("prompt");
        else if (ownStatus === "error") setRevision((value) => value + 1);
        else if (ownStatus === "ready") setModal("review");
    }

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

    const ctaLabel = isAuthenticated && ownStatus === "error" ? "Повторить проверку" : myReview ? "Редактировать отзыв" : "Оставить отзыв";
    const cta = <button className="kp-button" type="button" onClick={openReview} disabled={isAuthenticated && ownStatus === "loading"}>{ctaLabel}</button>;
    return <div className="reviews-page-shell">
        <AppShell active="reviews" onLogin={() => setModal("auth")} contentClassName="reviews-page">
            <PageHeader eyebrow="KingPromotion · Отзывы" title="Отзывы наших клиентов" description="Реальный опыт пользователей KingPromotion. Делитесь впечатлениями и помогайте нам становиться лучше." actions={cta} />
            {isAuthenticated && ownStatus === "error" && <p role="alert" className="reviews-inline-error">Не удалось проверить ваш отзыв. Нажмите «Повторить проверку».</p>}
            {status === "ready" && <ReviewsStats stats={stats} />}
            <section aria-labelledby="reviews-list-title">
                <div className="reviews-toolbar">
                    <h2 id="reviews-list-title">Опыт наших клиентов</h2>
                    <label className="reviews-sort"><span>Сортировка</span><select className="kp-field" value={sort} onChange={(event) => setSort(event.target.value)}>
                        <option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="highest">С высокой оценкой</option><option value="lowest">С низкой оценкой</option>
                    </select></label>
                </div>
                {status === "loading" && <ReviewsSkeleton />}
                {status === "error" && <EmptyState><h3>Не удалось загрузить отзывы</h3><p>Попробуйте ещё раз чуть позже.</p><button className="kp-button kp-button--secondary" type="button" onClick={() => setRevision((value) => value + 1)}>Попробовать снова</button></EmptyState>}
                {status === "ready" && (items.length ? <>
                    <div className="reviews-grid">{items.map((review) => <ReviewCard key={review.id} review={review} />)}</div>
                    <div className="reviews-more" aria-live="polite">
                        {moreError && <p role="alert">Не удалось загрузить следующую страницу. Попробуйте ещё раз.</p>}
                        {nextOffset !== null && <button className="kp-button kp-button--secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Загружаем…" : moreError ? "Попробовать снова" : "Показать ещё"}</button>}
                        <span className="reviews-loaded">Показано {items.length} из {stats.total}</span>
                    </div>
                </> : <EmptyState><h3>Пока нет отзывов</h3><p>Станьте первым, кто поделится своим опытом.</p>{cta}</EmptyState>)}
            </section>
        </AppShell>
        {notice && <div className="reviews-notice kp-status kp-status--success" role="status"><i />{notice}</div>}
        {modal === "prompt" && <Modal title="Войдите в аккаунт" onClose={() => setModal(null)} className="reviews-modal">
            <div className="review-form"><h2>Войдите в аккаунт</h2><p>Чтобы оставить отзыв, необходимо войти в аккаунт.</p><div className="reviews-dialog-actions"><button className="kp-button" type="button" onClick={() => setModal("auth")}>Войти</button><button className="kp-button kp-button--secondary" type="button" onClick={() => setModal(null)}>Отмена</button></div></div>
        </Modal>}
        {modal === "auth" && <Modal title="Авторизация" onClose={() => setModal(null)}><HeroRegisterForm onAuthSuccess={afterAuth} /></Modal>}
        {modal === "review" && <ReviewModal review={myReview} onClose={() => setModal(null)} onUnauthorized={() => setModal("prompt")} onConflict={() => setRevision((value) => value + 1)} onSaved={(review, edited) => {
            setMyReview(review); setModal(null);
            setNotice(edited ? "Спасибо! Ваш отзыв обновлён." : "Спасибо! Ваш отзыв опубликован.");
            setRevision((value) => value + 1);
        }} />}
    </div>;
}
