/* Серверная пагинация: фронт не загружает десятки тысяч записей. */

export default function Pagination({ page, limit, total, onPage }) {
    const pages = Math.max(1, Math.ceil((total || 0) / limit));
    if (pages <= 1 && !total) return null;
    return (
        <div className="admin-pagination">
            <span className="admin-pagination-total">
                Всего: {Number(total || 0).toLocaleString("ru-RU")}
            </span>
            <div className="admin-pagination-controls">
                <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Предыдущая страница">
                    ←
                </button>
                <span>
                    {page} / {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Следующая страница">
                    →
                </button>
            </div>
        </div>
    );
}
