/* Аккуратный SVG-график линиями в стиле KingPromotion.
   Несколько серий: золото (оборот), зелёный (прибыль), синий и т.д. */

const SERIES_COLORS = ["#ffd15a", "#52d378", "#7aa2ff", "#ff915c"];

function tickLabel(ts, bucket) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    if (bucket === "hour") {
        return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function LineChart({ series = [], bucket = "day", height = 230 }) {
    const allTs = [...new Set(series.flatMap((item) => item.points.map((point) => point.ts)))].sort();
    if (allTs.length === 0) {
        return <div className="admin-chart-empty">Нет данных за выбранный период</div>;
    }

    const values = series.flatMap((item) => item.points.map((point) => Number(point.value)));
    const min = Math.min(0, ...values);
    const max = Math.max(...values, 1);
    const spread = max - min || 1;
    const yMin = Math.max(0, min - spread * 0.08);
    const yMax = max + spread * 0.12;

    const W = 760;
    const H = height;
    const PAD_L = 10;
    const PAD_R = 12;
    const PAD_T = 12;
    const PAD_B = 24;

    const xFor = (index) =>
        allTs.length === 1 ? W / 2 : PAD_L + (index * (W - PAD_L - PAD_R)) / (allTs.length - 1);
    const yFor = (value) => PAD_T + (1 - (value - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        y: PAD_T + fraction * (H - PAD_T - PAD_B),
        value: yMin + (1 - fraction) * (yMax - yMin),
    }));
    const labelStep = Math.max(1, Math.ceil(allTs.length / 7));

    return (
        <figure className="admin-chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="График динамики">
                {gridLines.map((line) => (
                    <g key={line.y}>
                        <line x1={PAD_L} x2={W - PAD_R} y1={line.y} y2={line.y} className="admin-chart-grid" />
                        <text x={W - PAD_R} y={line.y - 4} className="admin-chart-axis" textAnchor="end">
                            {Number.isFinite(line.value) ? Math.round(line.value).toLocaleString("ru-RU") : ""}
                        </text>
                    </g>
                ))}
                {allTs.map((ts, index) =>
                    index % labelStep === 0 ? (
                        <text key={ts} x={xFor(index)} y={H - 7} className="admin-chart-axis" textAnchor="middle">
                            {tickLabel(ts, bucket)}
                        </text>
                    ) : null
                )}
                {series.map((item, seriesIndex) => {
                    const color = item.color || SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
                    const points = item.points
                        .filter((point) => allTs.includes(point.ts))
                        .map((point) => `${xFor(allTs.indexOf(point.ts))},${yFor(Number(point.value))}`)
                        .join(" ");
                    return (
                        <g key={item.name}>
                            <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                            {item.points.map((point) => (
                                <circle key={point.ts} cx={xFor(allTs.indexOf(point.ts))} cy={yFor(Number(point.value))} r="3" fill={color}>
                                    <title>{`${item.name}: ${Number(point.value).toLocaleString("ru-RU")}`}</title>
                                </circle>
                            ))}
                        </g>
                    );
                })}
            </svg>
            <figcaption className="admin-chart-legend">
                {series.map((item, index) => (
                    <span key={item.name} className="admin-chart-legend-item">
                        <i style={{ background: item.color || SERIES_COLORS[index % SERIES_COLORS.length] }} />
                        {item.name}
                    </span>
                ))}
            </figcaption>
        </figure>
    );
}
