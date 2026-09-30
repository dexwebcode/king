/* Единый механизм выбора периода для всей статистики.
   Frontend передаёт диапазон дат backend, агрегация выполняется в SQL. */

const PRESETS = [
    { value: "today", label: "Сегодня" },
    { value: "7d", label: "7 дней" },
    { value: "30d", label: "30 дней" },
    { value: "this_month", label: "Этот месяц" },
    { value: "last_month", label: "Прошлый месяц" },
    { value: "custom", label: "Выбрать даты" },
];

export default function PeriodPicker({ value = { period: "7d" }, onChange }) {
    const { period = "7d", dateFrom = "", dateTo = "" } = value;

    function update(patch) {
        onChange({ period, dateFrom, dateTo, ...patch });
    }

    return (
        <div className="admin-period">
            <div className="admin-period-tabs" role="tablist" aria-label="Период статистики">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.value}
                        type="button"
                        className={period === preset.value ? "is-active" : ""}
                        onClick={() => update({ period: preset.value })}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
            {period === "custom" && (
                <div className="admin-period-custom">
                    <input
                        className="kp-field"
                        type="date"
                        value={dateFrom}
                        onChange={(event) => update({ dateFrom: event.target.value })}
                        aria-label="Дата начала"
                    />
                    <span>—</span>
                    <input
                        className="kp-field"
                        type="date"
                        value={dateTo}
                        onChange={(event) => update({ dateTo: event.target.value })}
                        aria-label="Дата окончания"
                    />
                </div>
            )}
        </div>
    );
}

/* Параметры запроса для backend: для preset — только period,
   для custom — period, date_from, date_to. */
export function periodParams(value) {
    const { period = "7d", dateFrom = "", dateTo = "" } = value;
    if (period === "custom") {
        if (!dateFrom || !dateTo) return null;
        return { period, date_from: dateFrom, date_to: dateTo };
    }
    return { period };
}
