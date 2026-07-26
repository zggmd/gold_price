'use client';

import { useRef, useState } from 'react';

import type { HistoryPoint } from '@/lib/types';
import { formatAxisTime, formatPrice, formatRate } from '@/lib/format';

interface HistoryChartProps {
  points: HistoryPoint[];
  accent: string;
  precision: number;
  unit: string;
  spanDays: number;
  loading?: boolean;
}

const VBW = 820;
const VBH = 340;
const PAD = { l: 60, r: 20, t: 18, b: 30 };

export default function HistoryChart({
  points,
  accent,
  precision,
  unit,
  spanDays,
  loading,
}: HistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const plotW = VBW - PAD.l - PAD.r;
  const plotH = VBH - PAD.t - PAD.b;

  const hasData = points.length >= 2;

  // Y scale with ~3% padding so the line never kisses the edges.
  let prices = points.map((p) => p.price);
  let minP = hasData ? Math.min(...prices) : 0;
  let maxP = hasData ? Math.max(...prices) : 1;
  if (hasData && minP === maxP) {
    minP -= Math.abs(minP) * 0.01 || 1;
    maxP += Math.abs(maxP) * 0.01 || 1;
  }
  const pad = (maxP - minP) * 0.06 || maxP * 0.02 || 1;
  minP -= pad;
  maxP += pad;

  const xFor = (i: number) =>
    hasData ? PAD.l + (i / (points.length - 1)) * plotW : PAD.l;
  const yFor = (p: number) => PAD.t + (1 - (p - minP) / (maxP - minP || 1)) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.price).toFixed(1)}`)
    .join(' ');
  const baseY = PAD.t + plotH;
  const areaPath = hasData
    ? `${linePath} L${xFor(points.length - 1).toFixed(1)},${baseY.toFixed(1)} L${xFor(0).toFixed(1)},${baseY.toFixed(1)} Z`
    : '';

  // Range delta first→last.
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  const deltaPct =
    first != null && last != null && first !== 0
      ? ((last - first) / first) * 100
      : null;
  const deltaUp = (deltaPct ?? 0) >= 0;

  // ~5 evenly spaced x-axis labels.
  const tickCount = Math.min(6, points.length);
  const ticks =
    hasData && tickCount > 1
      ? Array.from({ length: tickCount }, (_, i) =>
          Math.round((i / (tickCount - 1)) * (points.length - 1)),
        )
      : [];

  // 3 y labels: top, middle, bottom.
  const yTicks = hasData ? [maxP, (maxP + minP) / 2, minP] : [];

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasData) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = (e.clientX - rect.left) * (VBW / rect.width);
    const rel = (vbX - PAD.l) / plotW;
    let idx = Math.round(rel * (points.length - 1));
    idx = Math.max(0, Math.min(points.length - 1, idx));
    setHover(idx);
  }

  const h = hover != null ? points[hover] : null;
  const hx = h ? xFor(hover!) : 0;
  const hy = h ? yFor(h.price) : 0;

  // Tooltip box (SVG-native so no HTML-overlay math is needed).
  const tipW = 150;
  const tipH = 46;
  const tipX = h
    ? Math.min(Math.max(hx - tipW / 2, PAD.l), VBW - PAD.r - tipW)
    : 0;
  const tipY = h ? Math.max(hy - tipH - 12, PAD.t) : 0;

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VBW} ${VBH}`}
        className="w-full"
        style={{ height: 340 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="历史价格走势"
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines */}
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={`y${i}`}>
              <line
                x1={PAD.l}
                x2={VBW - PAD.r}
                y1={y}
                y2={y}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 8}
                y={y + 4}
                textAnchor="end"
                className="tnum fill-[var(--muted-soft)]"
                fontSize={11}
              >
                {formatPrice(v, precision)}
              </text>
            </g>
          );
        })}

        {/* x-axis labels */}
        {ticks.map((idx, i) => (
          <text
            key={`x${i}`}
            x={xFor(idx)}
            y={VBH - 8}
            textAnchor="middle"
            className="fill-[var(--muted-soft)]"
            fontSize={11}
          >
            {formatAxisTime(points[idx].t, spanDays)}
          </text>
        ))}

        {hasData && (
          <>
            <path d={areaPath} fill="url(#areaFill)" />
            <path
              d={linePath}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        {/* hover guide + dot + tooltip */}
        {h && (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={PAD.t}
              y2={baseY}
              stroke="var(--guide)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle cx={hx} cy={hy} r={4.5} fill={accent} stroke="var(--page)" strokeWidth={2} />
            <g transform={`translate(${tipX},${tipY})`}>
              <rect
                width={tipW}
                height={tipH}
                rx={8}
                fill="var(--tooltip)"
                stroke="var(--border-strong)"
              />
              <text x={10} y={19} className="tnum fill-[var(--text-strong)]" fontSize={13} fontWeight={600}>
                {formatPrice(h.price, precision)} {unit}
              </text>
              <text x={10} y={36} className="fill-[var(--muted)]" fontSize={11}>
                {formatAxisTime(h.t, spanDays)}
              </text>
            </g>
          </g>
        )}

        {!hasData && !loading && (
          <text
            x={VBW / 2}
            y={VBH / 2}
            textAnchor="middle"
            className="fill-[var(--muted-soft)]"
            fontSize={14}
          >
            暂无历史数据，等待采集…
          </text>
        )}
      </svg>

      {/* range change badge */}
      {deltaPct != null && (
        <div className="pointer-events-none absolute right-2 top-1 flex items-center gap-2 rounded-lg bg-[var(--surface-strong)] px-2.5 py-1 text-xs backdrop-blur">
          <span className="text-[var(--muted)]">区间涨跌</span>
          <span
            className={
              'tnum font-semibold ' +
              (deltaUp ? 'text-rose-400' : 'text-emerald-400')
            }
          >
            {deltaUp ? '▲' : '▼'} {formatRate(deltaPct).replace('+', '')}
          </span>
        </div>
      )}
    </div>
  );
}
