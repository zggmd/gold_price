'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HistoryPoint, LatestPrice, MetalMeta } from '@/lib/types';
import { formatClock } from '@/lib/format';
import PriceCard from '@/components/PriceCard';
import HistoryChart from '@/components/HistoryChart';
import RangeTabs from '@/components/RangeTabs';
import ThemeSelector from '@/components/ThemeSelector';

const RANGE_OPTIONS = ['1h', '6h', '24h', '7d', '30d', '90d', 'all'] as const;
const RANGE_DAYS: Record<string, number> = {
  '1h': 1 / 24,
  '6h': 6 / 24,
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: 9999,
};
const UI_REFRESH_MS = 30_000;

interface LatestResponse {
  metals: MetalMeta[];
  prices: LatestPrice[];
  sparklines: Record<string, HistoryPoint[]>;
  fetchedAt: number | null;
  coverage: {
    earliest: number | null;
    latest: number | null;
    rawCount: number;
    hourlyCount: number;
  };
}

interface HistoryResponse {
  metal: MetalMeta;
  range: string;
  source: 'raw' | 'merged';
  points: HistoryPoint[];
}

export default function HomePage() {
  const [metals, setMetals] = useState<MetalMeta[]>([]);
  const [prices, setPrices] = useState<LatestPrice[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, HistoryPoint[]>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<LatestResponse['coverage'] | null>(null);

  const [selected, setSelected] = useState<string>('cny-gold');
  const [range, setRange] = useState<string>('24h');

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyMeta, setHistoryMeta] = useState<MetalMeta | null>(null);
  const [historySource, setHistorySource] = useState<'raw' | 'merged'>('raw');
  const [historyLoading, setHistoryLoading] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const latestAbort = useRef<AbortController | null>(null);

  const loadLatest = useCallback(async () => {
    latestAbort.current?.abort();
    const ac = new AbortController();
    latestAbort.current = ac;
    try {
      const res = await fetch('/api/prices/latest', { cache: 'no-store', signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LatestResponse;
      setMetals(data.metals);
      setPrices(data.prices);
      setSparklines(data.sparklines);
      setFetchedAt(data.fetchedAt);
      setCoverage(data.coverage);
      setError(null);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBootLoading(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Auto-refresh the persisted snapshot on a fixed cadence.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadLatest, UI_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, loadLatest]);

  // Fetch history whenever the selected metal or range changes.
  useEffect(() => {
    if (!selected) return;
    const ac = new AbortController();
    setHistoryLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/prices/history?metal=${encodeURIComponent(selected)}&range=${range}`,
          { cache: 'no-store', signal: ac.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HistoryResponse;
        setHistory(data.points);
        setHistoryMeta(data.metal);
        setHistorySource(data.source);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setHistory([]);
        }
      } finally {
        setHistoryLoading(false);
      }
    })();
    return () => ac.abort();
  }, [selected, range]);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/prices/now', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { fetchedAt: number; prices: LatestPrice[] };
      setPrices((prev) => {
        const map = new Map(prev.map((p) => [p.key, p]));
        for (const p of data.prices) map.set(p.key, p);
        return Array.from(map.values());
      });
      setLiveAt(data.fetchedAt);
      setError(null);
    } catch (err) {
      setError('实时获取失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const pricesByKey = useMemo(
    () => new Map(prices.map((p) => [p.key, p])),
    [prices],
  );

  const cnyMetals = metals.filter((m) => m.currency === 'CNY');
  const usdMetals = metals.filter((m) => m.currency === 'USD');

  const selectedMeta =
    historyMeta ?? metals.find((m) => m.key === selected) ?? null;

  const lastUpdated = liveAt ?? fetchedAt;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)] sm:text-3xl">
              贵金属行情
            </h1>
            {autoRefresh && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-[var(--live-text)]">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                实时
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            工商银行账户贵金属 · 黄金 / 白银 / 铂金 / 钯金 · 数据自动采集
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ThemeSelector />
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-right">
            <div className="text-[11px] text-[var(--muted-soft)]">
              {liveAt ? '实时获取' : '最近采集'}
            </div>
            <div className="tnum text-sm font-medium text-[var(--text)]">
              {formatClock(lastUpdated)}
            </div>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="accent-gold-500"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>
          <button
            type="button"
            onClick={refreshNow}
            disabled={refreshing}
            className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? '获取中…' : '立即刷新'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Price cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bootLoading && metals.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[128px] animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
              />
            ))
          : metals.map((m) => {
              const p = pricesByKey.get(m.key);
              if (!p) {
                return (
                  <div
                    key={m.key}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--muted-soft)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: m.accent }}
                      />
                      <span className="text-sm font-medium text-[var(--text)]">
                        {m.name}
                      </span>
                    </div>
                    <div className="mt-4 text-sm">等待采集…</div>
                  </div>
                );
              }
              return (
                <PriceCard
                  key={m.key}
                  price={p}
                  sparkline={sparklines[m.key]}
                  selected={selected === m.key}
                  onSelect={setSelected}
                />
              );
            })}
      </section>

      {/* Chart */}
      <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-strong)]">历史走势</h2>
            <p className="text-xs text-[var(--muted-soft)]">
              点击上方卡片或下方标签切换品种 ·{' '}
              {historySource === 'merged'
                ? '数据源：明细 + 小时聚合'
                : '数据源：实时明细'}
            </p>
          </div>
          <RangeTabs
            value={range}
            options={RANGE_OPTIONS}
            onChange={setRange}
          />
        </div>

        {/* Metal selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          <MetalGroup
            label="人民币账户"
            metals={cnyMetals}
            selected={selected}
            onSelect={setSelected}
          />
          <span className="mx-1 hidden items-center text-[var(--border-strong)] sm:flex">|</span>
          <MetalGroup
            label="美元账户"
            metals={usdMetals}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        {selectedMeta && (
          <HistoryChart
            points={history}
            accent={selectedMeta.accent}
            precision={selectedMeta.precision}
            unit={selectedMeta.unit}
            spanDays={RANGE_DAYS[range] ?? 1}
            loading={historyLoading}
          />
        )}
      </section>

      {/* Footer */}
      <footer className="mt-8 flex flex-col gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-soft)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          数据来源：中国工商银行 · 仅供展示，不构成投资建议
        </div>
        {coverage && (
          <div className="tnum">
            明细 {coverage.rawCount.toLocaleString()} 条 · 聚合{' '}
            {coverage.hourlyCount.toLocaleString()} 条
            {coverage.earliest
              ? ' · 起始 ' + formatClock(coverage.earliest)
              : ''}
          </div>
        )}
      </footer>
    </main>
  );
}

function MetalGroup({
  label,
  metals,
  selected,
  onSelect,
}: {
  label: string;
  metals: MetalMeta[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  if (metals.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-[var(--muted-soft)]">{label}</span>
      {metals.map((m) => {
        const active = m.key === selected;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(m.key)}
            className={
              'rounded-lg border px-2.5 py-1 text-xs font-medium transition ' +
              (active
                ? 'border-gold-400/60 bg-gold-500/15 text-[var(--gold-chip-text)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-strong)]')
            }
          >
            {shortName(m)}
          </button>
        );
      })}
    </div>
  );
}

function shortName(m: MetalMeta): string {
  const map: Record<string, string> = {
    gold: '黄金',
    silver: '白银',
    platinum: '铂金',
    palladium: '钯金',
  };
  return map[m.type] ?? m.name;
}
