// Number/time formatting helpers shared by server and client.

export function formatPrice(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function formatRate(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '--';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

/** Chinese market convention: 涨红跌绿 (up = red, down = green). */
export function rateColor(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate) || rate === 0) return 'text-slate-300';
  return rate > 0 ? 'text-rose-400' : 'text-emerald-400';
}

export function rateArrow(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return '';
  if (rate > 0) return '▲';
  if (rate < 0) return '▼';
  return '';
}

export function formatClock(ms: number | null | undefined): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatAxisTime(ms: number, spanDays: number): string {
  const d = new Date(ms);
  if (spanDays > 2) {
    return d.toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
    });
  }
  return d.toLocaleString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}
