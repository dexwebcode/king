import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import OrderCard from "../Landing/components/OrderCard/OrderCard";
import { AppShell, EmptyState, PageHeader, Panel, StatusBadge } from "../../ui/AppShell";
import {
    cleanServiceName,
    displayPlatform,
    displayServiceType,
    formatMoney,
    itemServiceType,
    platformIcon,
    providerServiceId,
} from "../../ui/catalogMeta";
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
    const location = useLocation();
    const [draft, setDraft] = useState(readOrderDraft);
    const [section, setSection] = useState(location.state?.section || (readOrderDraft() ? "create" : "orders"));
    const [account, setAccount] = useState(null);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (location.state?.section) setSection(location.state.section);
    }, [location.state]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        let active = true;
        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch(`${API_URL}/api/me`, { headers }),
            fetch(`${API_URL}/api/my-orders`, { headers }),
            fetch(`${API_URL}/price`),
        ])
            .then(async ([accountResponse, ordersResponse, priceResponse]) => {
                const [accountData, ordersData, priceData] = await Promise.all([
                    accountResponse.json(), ordersResponse.json(), priceResponse.json(),
                ]);
                if (!accountResponse.ok || !ordersResponse.ok) throw new Error("Не удалось загрузить кабинет");
                if (!active) return;
                setAccount(accountData);
                setOrders(Array.isArray(ordersData.items) ? ordersData.items : []);
                setServices(priceResponse.ok && Array.isArray(priceData?.items) ? priceData.items : []);
            })
            .catch((loadError) => active && setError(loadError.message || "Не удалось загрузить кабинет"))
            .finally(() => active && setLoading(false));

        return () => { active = false; };
    }, []);

    const servicesById = useMemo(() => new Map(
        services.map((item) => [providerServiceId(item), item]),
    ), [services]);

    function handleDraftSaved(savedDraft) {
        setDraft(savedDraft);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function handleDeleteDraft() {
        if (!window.confirm("Удалить черновик заказа?")) return;
        localStorage.removeItem(ORDER_DRAFT_KEY);
        setDraft(null);
        setError("");
    }

    async function handlePayment() {
        const token = localStorage.getItem("token");
        if (!draft || !token || paymentLoading) return;
        try {
            setPaymentLoading(true);
            setError("");
            const response = await fetch(`${API_URL}/api/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

    const descriptions = {
        create: "Пять коротких шагов: площадка, тип услуги, тариф, параметры и проверка.",
        orders: "Статусы оплаты и выполнения заказов обновляются автоматически.",
        balance: "Текущий пользовательский баланс KingPromotion.",
    };

    return (
        <AppShell active={section} account={account} onSectionChange={setSection} contentClassName={section === "create" && !draft ? "main-wide" : ""}>
            {loading ? <Panel className="main-message">Загружаем кабинет…</Panel> : (
                <>
                    {(section !== "create" || draft) && (
                        <PageHeader
                            eyebrow="Личный кабинет"
                            title={section === "create" ? "Подтверждение заказа" : section === "orders" ? "Мои заказы" : "Баланс"}
                            description={descriptions[section]}
                        />
                    )}
                    {error && <p className="main-alert" role="alert">{error}</p>}

                    {section === "create" && draft && (
                        <Panel className="draft-panel">
                            <div className="draft-panel-head">
                                <div><p className="kp-eyebrow">Черновик сохранён</p><h2>Проверьте детали перед оплатой</h2></div>
                                <button className="draft-delete" type="button" onClick={handleDeleteDraft}>Удалить</button>
                            </div>
                            <dl className="draft-summary">
                                <div><dt>Площадка</dt><dd>{draft.platform_name || displayPlatform(draft.platform)}</dd></div>
                                <div><dt>Тип услуги</dt><dd>{draft.service_type_name || displayServiceType(draft.service_type)}</dd></div>
                                <div><dt>Услуга</dt><dd>{draft.service_name || `#${draft.service_id}`}</dd></div>
                                <div><dt>Количество</dt><dd>{Number(draft.quantity).toLocaleString("ru-RU")}</dd></div>
                                <div className="draft-link"><dt>Ссылка</dt><dd>{draft.recipient_link}</dd></div>
                                <div className="draft-total"><dt>К оплате</dt><dd>{draft.display_total} ₽</dd></div>
                            </dl>
                            <div className="payment-method"><span>QR</span><div><strong>СБП</strong><small>Сервер ещё раз проверит услугу, лимиты и актуальную цену.</small></div><i>✓</i></div>
                            <button className="kp-button draft-pay" type="button" onClick={handlePayment} disabled={paymentLoading}>
                                {paymentLoading ? "Создаём платёж…" : "Перейти к оплате"}
                            </button>
                        </Panel>
                    )}

                    {section === "create" && !draft && <OrderCard onDraftSaved={handleDraftSaved} />}

                    {section === "orders" && (
                        <Panel className="orders-panel">
                            {orders.length === 0 ? <EmptyState>У вас пока нет заказов.</EmptyState> : (
                                <div className="orders-list">
                                    {orders.map((order) => {
                                        const service = servicesById.get(String(order.service_id));
                                        const icon = platformIcon(order.platform);
                                        return (
                                            <article className="order-row" key={order.id}>
                                                <div className="order-platform-icon">{icon ? <img src={icon} alt="" /> : displayPlatform(order.platform).slice(0, 1)}</div>
                                                <div className="order-primary">
                                                    <small>Заказ №{order.id} · {displayPlatform(order.platform)}</small>
                                                    <strong>{service ? cleanServiceName(service.name) : `Услуга #${order.service_id}`}</strong>
                                                    <span>{service ? displayServiceType(itemServiceType(service)) : "Продвижение"}</span>
                                                </div>
                                                <dl className="order-metrics">
                                                    <div><dt>Количество</dt><dd>{Number(order.quantity).toLocaleString("ru-RU")}</dd></div>
                                                    {order.remains !== null && order.remains !== undefined && <div><dt>Осталось</dt><dd>{Number(order.remains).toLocaleString("ru-RU")}</dd></div>}
                                                    <div><dt>Сумма</dt><dd>{formatMoney(order.amount)} ₽</dd></div>
                                                </dl>
                                                <StatusBadge status={order.status}>{order.status}</StatusBadge>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </Panel>
                    )}

                    {section === "balance" && (
                        <Panel className="balance-panel">
                            <p className="kp-eyebrow">Доступно сейчас</p>
                            <strong>{formatMoney(account?.balance)} ₽</strong>
                            <p>Баланс обновляется после подтверждённых финансовых операций.</p>
                        </Panel>
                    )}
                </>
            )}
        </AppShell>
    );
}
