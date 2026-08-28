import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import logo from "../../assets/logo.png";
import { logoutUser } from "../Landing/components/Hero/auth/authApi";
import OrderCard from "../Landing/components/OrderCard/OrderCard";
import "./Main.css";

const API_URL = import.meta.env.VITE_API_URL || "";
const ORDER_DRAFT_KEY = "king_order_draft";

function readOrderDraft() {
    try {
        const value = localStorage.getItem(ORDER_DRAFT_KEY);
        return value ? JSON.parse(value) : null;
    } catch {
        localStorage.removeItem(ORDER_DRAFT_KEY);
        return null;
    }
}

function apiError(data, fallback) {
    return typeof data?.detail === "string" ? data.detail : fallback;
}

export default function Main() {
    const navigate = useNavigate();
    const location = useLocation();
    const [draft, setDraft] = useState(readOrderDraft);
    const [section, setSection] = useState(
        location.state?.section || (readOrderDraft() ? "create" : "orders")
    );
    const [account, setAccount] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const token = localStorage.getItem("token");
        let active = true;

        async function loadCabinet() {
            try {
                const headers = { Authorization: `Bearer ${token}` };
                const [accountResponse, ordersResponse] = await Promise.all([
                    fetch(`${API_URL}/api/me`, { headers }),
                    fetch(`${API_URL}/api/my-orders`, { headers }),
                ]);
                const accountData = await accountResponse.json();
                const ordersData = await ordersResponse.json();
                if (!accountResponse.ok || !ordersResponse.ok) {
                    throw new Error("Не удалось загрузить кабинет");
                }
                if (active) {
                    setAccount(accountData);
                    setOrders(Array.isArray(ordersData.items) ? ordersData.items : []);
                }
            } catch (loadError) {
                if (active) {
                    setError(loadError.message || "Не удалось загрузить кабинет");
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        loadCabinet();
        return () => {
            active = false;
        };
    }, []);

    function handleLogout() {
        logoutUser();
        navigate("/", { replace: true });
    }

    function handleDraftSaved(savedDraft) {
        setDraft(savedDraft);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function handleDeleteDraft() {
        if (!window.confirm("Удалить черновик заказа?")) {
            return;
        }

        localStorage.removeItem(ORDER_DRAFT_KEY);
        setDraft(null);
        setError("");
    }

    async function handlePayment() {
        const token = localStorage.getItem("token");
        if (!draft || !token || paymentLoading) {
            return;
        }

        try {
            setPaymentLoading(true);
            setError("");
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
                    payment_method: "sbp",
                    idempotence_key: crypto.randomUUID(),
                }),
            });
            const data = await response.json();
            if (!response.ok || !data?.order_id || !data?.confirmation_url) {
                throw new Error(apiError(data, "Не удалось создать платёж"));
            }

            localStorage.removeItem(ORDER_DRAFT_KEY);
            setDraft(null);
            localStorage.setItem("pending_order_id", String(data.order_id));
            window.location.assign(data.confirmation_url);
        } catch (paymentError) {
            setError(paymentError.message || "Не удалось создать платёж");
            setPaymentLoading(false);
        }
    }

    return (
        <main className="main-page">
            <header className="main-header">
                <Link to="/" className="main-brand" aria-label="KING PROMOTION">
                    <img src={logo} alt="" />
                    <span><strong>KING</strong><small>PROMOTION</small></span>
                </Link>

                <nav className="main-navigation" aria-label="Личный кабинет">
                    <button className={section === "create" ? "active" : ""} type="button" onClick={() => setSection("create")}>Создать заказ</button>
                    <button className={section === "orders" ? "active" : ""} type="button" onClick={() => setSection("orders")}>Мои заказы</button>
                    <button className={section === "balance" ? "active" : ""} type="button" onClick={() => setSection("balance")}>Баланс: {account?.balance || "0.00"} ₽</button>
                </nav>

                <button className="main-logout" type="button" onClick={handleLogout}>Выйти</button>
            </header>

            <section className={`main-content ${section === "create" && !draft ? "main-content--order-builder" : ""}`}>
                {loading && <p className="main-state">Загружаем кабинет...</p>}
                {error && <p className="main-error" role="alert">{error}</p>}

                {!loading && section === "create" && draft && (
                    <div className="cabinet-panel cabinet-create">
                        <p className="main-eyebrow">Оформление заказа</p>
                        <div className="draft-title-row">
                            <h1>Ваш заказ сохранён</h1>
                            <button className="cabinet-delete" type="button" onClick={handleDeleteDraft}>
                                Удалить черновик
                            </button>
                        </div>
                        <div className="draft-summary">
                            <div><span>Площадка</span><strong>{draft.platform_name || draft.platform}</strong></div>
                            <div><span>Вид накрутки</span><strong>{draft.service_type_name || draft.service_type}</strong></div>
                            <div><span>Услуга</span><strong>{draft.service_name || `#${draft.service_id}`}</strong></div>
                            <div><span>Количество</span><strong>{draft.quantity}</strong></div>
                            <div><span>Ссылка</span><strong>{draft.recipient_link}</strong></div>
                            <div className="draft-total"><span>К оплате</span><strong>{draft.display_total} ₽</strong></div>
                        </div>
                        <div className="cabinet-payment-method">
                            <span className="cabinet-payment-logo">QR</span>
                            <div><strong>СБП QR</strong><small>Итоговую стоимость повторно проверит сервер</small></div>
                            <span className="cabinet-payment-check">✓</span>
                        </div>
                        <button className="cabinet-primary" type="button" onClick={handlePayment} disabled={paymentLoading}>
                            {paymentLoading ? "Создаём платёж..." : "Перейти к оплате"}
                        </button>
                    </div>
                )}

                {!loading && section === "create" && !draft && (
                    <div className="cabinet-order-builder">
                        <OrderCard onDraftSaved={handleDraftSaved} />
                    </div>
                )}

                {!loading && section === "orders" && (
                    <div className="cabinet-panel">
                        <p className="main-eyebrow">История</p>
                        <h1>Мои заказы</h1>
                        {orders.length === 0 ? <p className="main-state">У вас пока нет заказов.</p> : (
                            <div className="orders-list">
                                {orders.map((order) => (
                                    <article className="order-history-card" key={order.id}>
                                        <div><small>Заказ №{order.id}</small><strong>{order.platform} · услуга {order.service_id}</strong><span>{order.quantity} шт. · {order.amount} ₽</span></div>
                                        <span className="order-history-status">{order.status}</span>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!loading && section === "balance" && (
                    <div className="cabinet-panel balance-panel">
                        <p className="main-eyebrow">Ваш баланс</p>
                        <h1>{account?.balance || "0.00"} ₽</h1>
                        <p>Баланс загружен из базы данных KingPromotion.</p>
                    </div>
                )}
            </section>
        </main>
    );
}
