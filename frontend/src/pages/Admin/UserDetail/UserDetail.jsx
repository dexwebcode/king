import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { adminApi } from "../adminApi";
import ConfirmModal from "../components/ConfirmModal/ConfirmModal";
import { formatDate, formatMoney } from "../format";
import "../AdminApp/AdminApp.css";

const PROVIDER_LABELS = { telegram: "Telegram", vk: "VK ID" };

export default function UserDetail() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [banModal, setBanModal] = useState(false);
    const [banReason, setBanReason] = useState("");
    const [unbanModal, setUnbanModal] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const result = await adminApi.user(userId);
            setData(result);
        } catch (requestError) {
            setError(requestError.message || "Не удалось загрузить пользователя");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    async function ban() {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await adminApi.banUser(userId, banReason);
            setNotice("Пользователь заблокирован. Все его сессии завершены.");
            setBanModal(false);
            setBanReason("");
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось заблокировать");
        } finally {
            setBusy(false);
        }
    }

    async function unban() {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await adminApi.unbanUser(userId);
            setNotice("Доступ пользователя восстановлен.");
            setUnbanModal(false);
            await load();
        } catch (requestError) {
            setError(requestError.message || "Не удалось разблокировать");
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <div className="admin-loading">Загружаем профиль…</div>;
    if (!data) {
        return (
            <>
                {error && <p className="admin-alert" role="alert">{error}</p>}
                <Link className="admin-back-link" to="/admin/users">← К списку пользователей</Link>
                <div className="admin-empty">Пользователь не найден.</div>
            </>
        );
    }

    const { user, social_accounts: socials = [], orders = [], tickets = [], reviews = [] } = data;

    return (
        <>
            <Link className="admin-back-link" to="/admin/users">← К списку пользователей</Link>
            {error && <p className="admin-alert" role="alert">{error}</p>}
            {notice && <p className="admin-notice" role="status">{notice}</p>}

            <div className="admin-detail-grid">
                <div>
                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Пользователь #{user.id}</p>
                                <h2>{user.login || user.email || "Без логина"}</h2>
                            </div>
                            {user.banned ? (
                                <span className="admin-badge admin-badge--banned">Заблокирован</span>
                            ) : (
                                <span className="admin-badge admin-badge--active">Активен</span>
                            )}
                        </div>
                        <dl className="admin-facts">
                            <div><dt>ID</dt><dd>{user.id}</dd></div>
                            <div><dt>Логин</dt><dd>{user.login || "—"}</dd></div>
                            <div><dt>Email</dt><dd>{user.email || "—"}</dd></div>
                            <div><dt>Группа</dt><dd>{user.user_group}</dd></div>
                            <div><dt>Баланс</dt><dd>{formatMoney(user.balance)}</dd></div>
                            <div><dt>Регистрация</dt><dd>{formatDate(user.created_at)}</dd></div>
                            <div><dt>Последняя активность</dt><dd>{formatDate(user.last_seen_at)}</dd></div>
                            {user.banned && (
                                <>
                                    <div><dt>Заблокирован</dt><dd>{formatDate(user.banned_at)}</dd></div>
                                    <div><dt>Кем</dt><dd>{user.banned_by ? `администратор ID ${user.banned_by}` : "—"}</dd></div>
                                    <div><dt>Причина</dt><dd>{user.ban_reason || "не указана"}</dd></div>
                                </>
                            )}
                        </dl>
                        <div style={{ marginTop: 18 }}>
                            {user.banned ? (
                                <button className="kp-button kp-button--secondary kp-button--small" type="button" disabled={busy} onClick={() => setUnbanModal(true)}>
                                    Разблокировать
                                </button>
                            ) : (
                                <button className="kp-button kp-button--danger kp-button--small" type="button" disabled={busy} onClick={() => setBanModal(true)}>
                                    Заблокировать
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Последние заказы</p>
                                <h2>История заказов</h2>
                            </div>
                        </div>
                        {orders.length === 0 ? (
                            <div className="admin-empty">Заказов нет.</div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>Услуга</th>
                                            <th>Кол-во</th>
                                            <th>Сумма</th>
                                            <th>Статус</th>
                                            <th>Дата</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map((order) => (
                                            <tr key={order.id} className="is-clickable" onClick={() => navigate(`/admin/orders/${order.id}`)}>
                                                <td><span className="admin-table-link">#{order.id}</span></td>
                                                <td>#{order.service_id}</td>
                                                <td>{Number(order.quantity).toLocaleString("ru-RU")}</td>
                                                <td>{formatMoney(order.amount)}</td>
                                                <td>{order.status}</td>
                                                <td className="admin-cell-muted">{formatDate(order.created_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>

                <div>
                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Способы входа</p>
                                <h2>Подключенные аккаунты</h2>
                            </div>
                        </div>
                        {socials.length === 0 ? (
                            <div className="admin-empty">Соцсети не подключены.</div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Тип</th>
                                            <th>Имя</th>
                                            <th>Подключен</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {socials.map((account) => (
                                            <tr key={account.provider}>
                                                <td>{PROVIDER_LABELS[account.provider] || account.provider}</td>
                                                <td>
                                                    {account.display_name || account.username || "—"}
                                                    {account.username && account.display_name ? <span className="admin-cell-muted"> (@{account.username})</span> : null}
                                                </td>
                                                <td className="admin-cell-nowrap admin-cell-muted">{formatDate(account.connected_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="admin-cell-muted" style={{ fontSize: 11.5, margin: "12px 0 0" }}>
                            Токены и секреты OAuth не хранятся в базе и не отображаются.
                        </p>
                    </section>

                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Поддержка</p>
                                <h2>Обращения</h2>
                            </div>
                        </div>
                        {tickets.length === 0 ? (
                            <div className="admin-empty">Обращений нет.</div>
                        ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                                {tickets.map((ticket) => (
                                    <li key={ticket.public_id} style={{ fontSize: 13 }}>
                                        <Link className="admin-table-link" to="/admin/support">
                                            #{ticket.public_id}
                                        </Link>{" "}
                                        <span className="admin-cell-muted">{ticket.subject}</span> · {ticket.status}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="admin-panel">
                        <div className="admin-section-head">
                            <div>
                                <p className="kp-eyebrow">Отзывы</p>
                                <h2>Отзывы пользователя</h2>
                            </div>
                        </div>
                        {reviews.length === 0 ? (
                            <div className="admin-empty">Отзывов нет.</div>
                        ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                                {reviews.map((review) => (
                                    <li key={review.id} style={{ fontSize: 13 }}>
                                        {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}{" "}
                                        <span className="admin-cell-muted">{formatDate(review.created_at)}{review.deleted ? " · удалён" : ""}</span>
                                        <p style={{ margin: "4px 0 0", color: "var(--kp-text-secondary)" }}>{review.text}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            <ConfirmModal
                open={banModal}
                title="Заблокировать пользователя"
                confirmLabel="Заблокировать"
                danger
                busy={busy}
                onCancel={() => setBanModal(false)}
                onConfirm={ban}
            >
                <p>
                    Пользователь потеряет доступ ко всем защищённым функциям сайта,
                    а все его сессии будут завершены. Действие попадёт в журнал администратора.
                </p>
                <input
                    className="kp-field"
                    type="text"
                    maxLength="500"
                    placeholder="Причина блокировки (необязательно)"
                    value={banReason}
                    onChange={(event) => setBanReason(event.target.value)}
                />
            </ConfirmModal>

            <ConfirmModal
                open={unbanModal}
                title="Разблокировать пользователя"
                confirmLabel="Разблокировать"
                busy={busy}
                onCancel={() => setUnbanModal(false)}
                onConfirm={unban}
            >
                <p>Пользователь снова получит доступ к сайту. Действие попадёт в журнал администратора.</p>
            </ConfirmModal>
        </>
    );

}
