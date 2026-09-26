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
import { getCachedAccount, getCachedPrices, getPrices, refreshAccount, subscribeAccount, updateCachedBalance } from "../../ui/dataCache";
import { useLanguage } from "../../ui/i18n";
import BalanceSection from "./BalanceSection";
import "./Main.css";

const API_URL = import.meta.env.VITE_API_URL || "";

/* Разделы кабинета: «Заказы» (быстрый заказ + история) и «Баланс».
   Старые значения section=create / section=orders приводим к одному разделу. */
function resolveSection(rawSection) {
    return rawSection === "balance" ? "balance" : "orders";
}

function resolveOrdersView(rawSection, rawView) {
    if (rawView === "history" || rawView === "quick") {
        return rawView;
    }
    // «Создать заказ» — быстрый заказ, всё остальное тоже открывает быстрый заказ.
    if (rawSection === "create") {
        return "quick";
    }
    return "quick";
}

export default function Main() {
    const { t } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const sectionFromQuery = new URLSearchParams(location.search).get("section");
    const rawSectionFromRoute = sectionFromQuery || location.state?.section;
    const [pendingDraft, setPendingDraft] = useState(readPendingCheckoutDraft);
    const [section, setSection] = useState(
        resolveSection(rawSectionFromRoute || (pendingDraft ? "create" : "orders")),
    );
    const [ordersView, setOrdersView] = useState(
        () => resolveOrdersView(rawSectionFromRoute, location.state?.ordersView),
    );
    const [account, setAccount] = useState(getCachedAccount);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState(() => getCachedPrices() || []);
    const [loading, setLoading] = useState(() => !getCachedAccount());
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const raw = new URLSearchParams(location.search).get("section") || location.state?.section;
        if (!raw) return;
        setSection(resolveSection(raw));
        setOrdersView(resolveOrdersView(raw, location.state?.ordersView));
    }, [location.search, location.state]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        let active = true;
        const headers = { Authorization: `Bearer ${token}` };
        const unsubscribe = subscribeAccount((nextAccount) => {
            if (active) setAccount(nextAccount);
        });

        refreshAccount()
            .then((data) => { if (active) setAccount(data); })
            .catch((loadError) => { if (active) setError(loadError.message || t("Не удалось загрузить баланс")); })
            .finally(() => { if (active) setLoading(false); });

        getPrices()
            .then((items) => { if (active) setServices(items); })
            .catch(() => {});

        fetch(`${API_URL}/api/my-orders`, { headers })
            .then(async (response) => {
                if (!response.ok) throw new Error(t("Не удалось загрузить заказы"));
                return response.json();
            })
            .then((data) => { if (active) setOrders(Array.isArray(data.items) ? data.items : []); })
            .catch((loadError) => { if (active) setError(loadError.message || t("Не удалось загрузить заказы")); })
            .finally(() => { if (active) setOrdersLoading(false); });

        return () => { active = false; unsubscribe(); };
    }, []);

    const servicesById = useMemo(() => new Map(
        services.map((item) => [providerServiceId(item), item]),
    ), [services]);

    function handleCheckoutRestored() {
        clearPendingCheckoutDraft();
        setPendingDraft(null);
    }

    /* Переключение раздела из меню: «Заказы» всегда открывает быстрый заказ. */
    const handleSectionChange = useCallback((nextSection) => {
        setSection(resolveSection(nextSection));
        setOrdersView(resolveOrdersView(nextSection));
    }, []);

    const descriptions = {
        orders: "Статусы оплаты и выполнения заказов обновляются автоматически.",
        balance: "Управляйте средствами и пополняйте баланс удобным способом.",
    };

    const returnedFromPayment = new URLSearchParams(location.search).get("topup") === "return";

    const handleBalanceChange = useCallback((nextBalance) => {
        updateCachedBalance(nextBalance);
        setAccount((currentAccount) => currentAccount ? { ...currentAccount, balance: nextBalance } : currentAccount);
    }, []);

    const handlePaymentSettled = useCallback(() => {
        if (returnedFromPayment) navigate("/main?section=balance", { replace: true });
    }, [navigate, returnedFromPayment]);

    const isQuickOrder = section === "orders" && ordersView === "quick";

    return (
        <AppShell
            active={section}
            account={account}
            onSectionChange={handleSectionChange}
            contentClassName={isQuickOrder ? "main-wide" : ""}
            titleClassName={section === "orders" ? "kp-section-title--switch" : ""}
            title={section === "orders" ? (
                <span className="orders-view-switch">
                    <button
                        type="button"
                        className={ordersView === "quick" ? "is-active" : ""}
                        aria-pressed={ordersView === "quick"}
                        onClick={() => setOrdersView("quick")}
                    >
                        {t("Быстрый заказ")}
                    </button>
                    <button
                        type="button"
                        className={ordersView === "history" ? "is-active" : ""}
                        aria-pressed={ordersView === "history"}
                        onClick={() => setOrdersView("history")}
                    >
                        {t("История")}
                    </button>
                </span>
            ) : t("Баланс")}
        >
            {loading ? <Panel className="main-message">{t("Загружаем кабинет…")}</Panel> : (
                <>
                    {section === "orders" && ordersView === "history" && (
                        <PageHeader
                            eyebrow={t("Личный кабинет")}
                            description={t(descriptions.orders)}
                        />
                    )}

                    {error && <p className="main-alert" role="alert">{t(error)}</p>}

                    {isQuickOrder && (
                        <OrderCard
                            initialDraft={pendingDraft}
                            onCheckoutRestored={handleCheckoutRestored}
                        />
                    )}

                    {section === "orders" && ordersView === "history" && (
                        <Panel className="orders-panel">
                            {ordersLoading ? <p>{t("Загружаем заказы…")}</p> : orders.length === 0 ? <EmptyState>{t("У вас пока нет заказов.")}</EmptyState> : (
                                <div className="orders-list">
                                    {orders.map((order) => {
                                        const service = servicesById.get(String(order.service_id));
                                        const icon = platformIcon(order.platform);
                                        return (
                                            <article className="order-row" key={order.id}>
                                                <div className="order-platform-icon">{icon ? <img src={icon} alt="" /> : displayPlatform(order.platform).slice(0, 1)}</div>
                                                <div className="order-primary">
                                                    <small>{t("Заказ №")}{order.id} · {t(displayPlatform(order.platform))}</small>
                                                    <strong>{service ? t(cleanServiceName(service.name)) : `${t("Услуга #")}${order.service_id}`}</strong>
                                                    <span>{service ? t(displayServiceType(itemServiceType(service))) : t("Продвижение")}</span>
                                                </div>
                                                <dl className="order-metrics">
                                                    <div><dt>{t("Количество")}</dt><dd>{Number(order.quantity).toLocaleString("ru-RU")}</dd></div>
                                                    {order.remains !== null && order.remains !== undefined && <div><dt>{t("Осталось")}</dt><dd>{Number(order.remains).toLocaleString("ru-RU")}</dd></div>}
                                                    <div><dt>{t("Сумма")}</dt><dd>{formatMoney(order.amount)} ₽</dd></div>
                                                </dl>
                                                <StatusBadge status={order.display_status || order.status}>
                                                    {order.display_status || order.status}
                                                </StatusBadge>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </Panel>
                    )}

                    {section === "balance" && (
                        <BalanceSection
                            balance={account?.balance}
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
