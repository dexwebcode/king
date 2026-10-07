import { useId, useMemo, useState } from "react";

import "./Chart.css";

/* Плавный SVG-график в стиле KingPromotion.
   Линии сглажены (Catmull-Rom → кубические Безье), под серией — градиентная
   заливка, при наведении появляется вертикальная направляющая с подсказкой,
   легенда подсвечивает выбранную линию. */

const SERIES_COLORS = ["#ffd15a", "#52d378", "#7aa2ff", "#ff915c"];

const VIEW_W = 760;
const PAD_L = 14;
const PAD_R = 66;
const PAD_T = 16;
const PAD_B = 28;

function tickLabel(ts, bucket) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    if (bucket === "hour") {
        return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function fullLabel(ts, bucket) {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    if (bucket === "hour") {
        return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatValue(value) {
    if (!Number.isFinite(value)) return "—";
    return Math.round(value).toLocaleString("ru-RU");
}

/* Компактные подписи оси: длинные суммы не растягивают график. */
function axisValue(value) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")} млн`;
    if (abs >= 10_000) return `${Math.round(value / 1000)} тыс.`;
    return formatValue(value);
}

function round(value) {
    return Math.round(value * 100) / 100;
}

/* Сглаженная линия: контрольные точки берутся у соседних узлов,
   поэтому кривая плавная, но без выбросов за пределы данных. */
function smoothPath(points, tension = 0.19) {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`;

    let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
        const prev = points[index - 1] || points[index];
        const start = points[index];
        const end = points[index + 1];
        const next = points[index + 2] || end;

        const c1x = start.x + (end.x - prev.x) * tension;
        const c1y = start.y + (end.y - prev.y) * tension;
        const c2x = end.x - (next.x - start.x) * tension;
        const c2y = end.y - (next.y - start.y) * tension;

        path += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(end.x)} ${round(end.y)}`;
    }
    return path;
}

export default function LineChart({ series = [], bucket = "day", height = 230 }) {
    const [hoverIndex, setHoverIndex] = useState(null);
    const [focusSeries, setFocusSeries] = useState(null);
    const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

    const allTs = useMemo(
        () => [...new Set(series.flatMap((item) => item.points.map((point) => point.ts)))].sort(),
        [series]
    );

    const geometry = useMemo(() => {
        if (allTs.length === 0) return null;

        const H = height;
        const values = series.flatMap((item) => item.points.map((point) => Number(point.value)));
        const max = Math.max(...values, 1);
        const yMax = max * 1.12;
        const base = H - PAD_B;

        const xFor = (index) =>
            allTs.length === 1
                ? (PAD_L + (VIEW_W - PAD_R)) / 2
                : PAD_L + (index * (VIEW_W - PAD_L - PAD_R)) / (allTs.length - 1);
        const yFor = (value) => PAD_T + (1 - value / (yMax || 1)) * (base - PAD_T);

        const lines = series.map((item, seriesIndex) => {
            const color = item.color || SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
            const byTs = new Map(item.points.map((point) => [point.ts, Number(point.value)]));
            const nodes = allTs
                .map((ts, index) => (byTs.has(ts) ? { x: xFor(index), y: yFor(byTs.get(ts)) } : null))
                .filter(Boolean);

            const line = smoothPath(nodes);
            const area = nodes.length > 1
                ? `${line} L ${round(nodes[nodes.length - 1].x)} ${round(base)} L ${round(nodes[0].x)} ${round(base)} Z`
                : "";

            return { name: item.name, color, byTs, line, area };
        });

        const gridLines = [0, 1 / 3, 2 / 3, 1].map((fraction) => ({
            y: PAD_T + fraction * (base - PAD_T),
            value: yMax * (1 - fraction),
        }));

        return {
            H,
            base,
            xFor,
            yFor,
            lines,
            gridLines,
            labelStep: Math.max(1, Math.ceil(allTs.length / 7)),
        };
    }, [series, allTs, height]);

    if (!geometry) {
        return <div className="admin-chart-empty">Нет данных за выбранный период</div>;
    }

    /* Ключ данных: при смене периода анимация линий проигрывается заново. */
    const dataKey = `${bucket}-${allTs.length}-${series.length}-${allTs[allTs.length - 1]}`;
    const hoverTs = hoverIndex === null ? null : allTs[hoverIndex];
    const hoverX = hoverIndex === null ? 0 : geometry.xFor(hoverIndex);

    function handleMove(event) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;

        let nearest = 0;
        let best = Infinity;
        allTs.forEach((ts, index) => {
            const distance = Math.abs(geometry.xFor(index) - x);
            if (distance < best) {
                best = distance;
                nearest = index;
            }
        });
        setHoverIndex(nearest);
    }

    const tipRows = hoverTs === null
        ? []
        : geometry.lines.map((line) => ({
            name: line.name,
            color: line.color,
            value: line.byTs.has(hoverTs) ? line.byTs.get(hoverTs) : null,
        }));
    /* Подсказка читаемая: крупный шрифт в единицах viewBox, поэтому она
       растёт вместе с графиком при раскрытии панели. */
    const tipWidth = 262;
    const tipHeight = 46 + tipRows.length * 25;
    const tipX = Math.min(Math.max(hoverX + 18, PAD_L), VIEW_W - tipWidth + 40);
    const tipY = PAD_T + 6;

    return (
        <figure className="admin-chart">
            <svg
                viewBox={`0 0 ${VIEW_W} ${geometry.H}`}
                role="img"
                aria-label="График динамики"
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverIndex(null)}
            >
                <defs>
                    {geometry.lines.map((line, index) => (
                        <linearGradient key={line.name} id={`${gradientId}-fill-${index}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={line.color} stopOpacity="0.32" />
                            <stop offset="62%" stopColor={line.color} stopOpacity="0.07" />
                            <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                        </linearGradient>
                    ))}
                </defs>

                <g key={dataKey}>
                    {geometry.gridLines.map((line) => (
                        <g key={line.y}>
                            <line x1={PAD_L} x2={VIEW_W - PAD_R} y1={line.y} y2={line.y} className="admin-chart-grid" />
                            <text x={VIEW_W - PAD_R + 10} y={line.y + 3.5} className="admin-chart-axis">
                                {axisValue(line.value)}
                            </text>
                        </g>
                    ))}
                    <line
                        x1={PAD_L}
                        x2={VIEW_W - PAD_R}
                        y1={geometry.base}
                        y2={geometry.base}
                        className="admin-chart-baseline"
                    />
                    {allTs.map((ts, index) =>
                        index % geometry.labelStep === 0 ? (
                            <text
                                key={ts}
                                x={geometry.xFor(index)}
                                y={geometry.H - 7}
                                className="admin-chart-axis"
                                textAnchor="middle"
                            >
                                {tickLabel(ts, bucket)}
                            </text>
                        ) : null
                    )}

                    {geometry.lines.map((line, index) => (
                        <g
                            key={line.name}
                            className={`admin-chart-series${focusSeries !== null && focusSeries !== index ? " is-dim" : ""}`}
                        >
                            {line.area ? (
                                <path
                                    d={line.area}
                                    fill={`url(#${gradientId}-fill-${index})`}
                                    className="admin-chart-area"
                                    style={{ animationDelay: `${0.25 + index * 0.08}s` }}
                                />
                            ) : null}
                            <path d={line.line} className="admin-chart-glow" stroke={line.color} />
                            <path
                                d={line.line}
                                className="admin-chart-line"
                                stroke={line.color}
                                pathLength="1"
                                style={{ animationDelay: `${index * 0.08}s` }}
                            />
                        </g>
                    ))}

                    {hoverTs !== null ? (
                        <g className="admin-chart-hover">
                            <line
                                x1={hoverX}
                                x2={hoverX}
                                y1={PAD_T - 4}
                                y2={geometry.base}
                                className="admin-chart-guide"
                            />
                            {tipRows.map((row) =>
                                row.value === null ? null : (
                                    <circle
                                        key={row.name}
                                        cx={hoverX}
                                        cy={geometry.yFor(row.value)}
                                        r="4.5"
                                        fill={row.color}
                                        className="admin-chart-dot"
                                    />
                                )
                            )}
                            <g className="admin-chart-tip" transform={`translate(${tipX}, ${tipY})`}>
                                <rect width={tipWidth} height={tipHeight} rx="14" />
                                <text x="17" y="26" className="admin-chart-tip-date">
                                    {fullLabel(hoverTs, bucket)}
                                </text>
                                {tipRows.map((row, index) => (
                                    <g key={row.name} transform={`translate(0, ${51 + index * 25})`}>
                                        <circle cx="23" cy="-5" r="4.5" fill={row.color} />
                                        <text x="38" className="admin-chart-tip-value">
                                            {row.name}: {row.value === null ? "—" : formatValue(row.value)}
                                        </text>
                                    </g>
                                ))}
                            </g>
                        </g>
                    ) : null}
                </g>
            </svg>

            <figcaption className="admin-chart-legend">
                {geometry.lines.map((line, index) => (
                    <span
                        key={line.name}
                        className="admin-chart-legend-item"
                        onMouseEnter={() => setFocusSeries(index)}
                        onMouseLeave={() => setFocusSeries(null)}
                    >
                        <i style={{ background: line.color }} />
                        {line.name}
                    </span>
                ))}
            </figcaption>
        </figure>
    );
}
