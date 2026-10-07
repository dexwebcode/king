import "./ConfirmModal.css";

/* Модальное окно подтверждения опасного действия. */

export default function ConfirmModal({
    open,
    title,
    children,
    confirmLabel = "Подтвердить",
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}) {
    if (!open) return null;
    return (
        <div className="admin-modal" role="dialog" aria-modal="true">
            <button
                className="admin-modal-backdrop"
                type="button"
                aria-label="Закрыть"
                onClick={busy ? undefined : onCancel}
            />
            <div className="admin-modal-card">
                <h2>{title}</h2>
                <div className="admin-modal-body">{children}</div>
                <div className="admin-modal-actions">
                    <button
                        className={`kp-button ${danger ? "kp-button--danger" : ""}`}
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                    >
                        {busy ? "Подождите…" : confirmLabel}
                    </button>
                    <button
                        className="kp-button kp-button--secondary"
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}
