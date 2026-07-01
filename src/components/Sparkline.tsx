'use client';

import type { HistoryPoint } from '@/lib/types';

interface SparklineProps {
  points: HistoryPoint[];
  color: string;
  width?: number;
  height?: number;
}

/**
 * A tiny decoration-only line chart for the price cards — no axes, no hover.
 * Colored by direction so the card reads green/red at a glance.
 */
export default function Sparkline({
  points,
  color,
  width = 120,
  height = 34,
}: SparklineProps) {
  if (points.length < 2) {
    return <div style={{ height }} className="w-full" />;
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = height - 2 - ((p.price - min) / span) * (height - 4);
    return [x, y] as const;
  });

  const up = points[points.length - 1].price >= points[0].price;
  const stroke = up ? '#34d399' : '#f87171';

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  const gid = `spark-${color.replace('#', '')}`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
