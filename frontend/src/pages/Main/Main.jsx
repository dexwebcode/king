import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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
import {
    clearPendingCheckoutDraft,
    readPendingCheckoutDraft,
} from "../../ui/orderDraft";
import BalanceSection from "./BalanceSection";
import "./Main.css";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function Main() {
    const location = useLocation();
    const navigate = useNavigate();
    const sectionFromQuery = new URLSearchParams(location.search).get("section");
    const [pendingDraft, setPendingDraft] = useState(readPendingCheckoutDraft);
    const [section, setSection] = useState(sectionFromQuery || location.state?.section || (pendingDraft ? "create" : "orders"));
    const [account, setAccount] = useState(null);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const querySection = new URLSearchParams(location.search).get("section");
        if (querySection) setSection(querySection);
        else if (location.state?.section) setSection(location.state.section);
    }, [location.search, location.state]);

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

    function handleCheckoutRestored() {
        clearPendingCheckoutDraft();
        setPendingDraft(null);
    }

    const descriptions = {
        create: "Пять коротких шагов: площадка, тип услуги, тариф, параметры и проверка.",
        orders: "Статусы оплаты и выполнения заказов обновляются автоматически.",
        balance: "Управляйте средствами и пополняйте баланс удобным способом.",
    };

    const returnedFromPayment = new URLSearchParams(location.search).get("topup") === "return";

    const handleBalanceChange = useCallback((nextBalance) => {
        setAccount((currentAccount) => currentAccount ? { ...currentAccount, balance: nextBalance } : currentAccount);
    }, []);

    const handlePaymentSettled = useCallback(() => {
        if (returnedFromPayment) navigate("/main?section=balance", { replace: true });
    }, [navigate, returnedFromPayment]);

    return (
        <AppShell active={section} account={account} onSectionChange={setSection} contentClassName={section === "create" ? "main-wide" : ""}>
            {loading ? <Panel className="main-message">Загружаем кабинет…</Panel> : (
                <>
                    {section !== "create" && (
                        <PageHeader
                            eyebrow="Личный кабинет"
                            title={section === "orders" ? "Мои заказы" : (
                                <span className="balance-page-title">
                                    <span>Баланс</span>
                                    <strong>{formatMoney(account?.balance)} ₽</strong>
                                </span>
                            )}
                            description={descriptions[section]}
                        />
                    )}
                    {error && <p className="main-alert" role="alert">{error}</p>}

                    {section === "create" && (
                        <OrderCard
                            initialDraft={pendingDraft}
                            onCheckoutRestored={handleCheckoutRestored}
                        />
                    )}

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
                        <BalanceSection
                            returnedFromPayment={returnedFromPayment}
                            onBalanceChange={handleBalanceChange}
                            onPaymentSettled={handlePaymentSettled}
                        />
                    )}
                </>
            )}
        </AppShell>
    );
}
