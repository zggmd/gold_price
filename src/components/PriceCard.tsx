'use client';

import type { HistoryPoint, LatestPrice } from '@/lib/types';
import { formatPrice, formatRate, rateArrow, rateColor } from '@/lib/format';
import Sparkline from './Sparkline';

interface PriceCardProps {
  price: LatestPrice;
  sparkline?: HistoryPoint[];
  selected: boolean;
  onSelect: (key: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  gold: '黄金',
  silver: '白银',
  platinum: '铂金',
  palladium: '钯金',
};

export default function PriceCard({
  price,
  sparkline,
  selected,
  onSelect,
}: PriceCardProps) {
  const up = (price.upDownRate ?? 0) > 0;
  const down = (price.upDownRate ?? 0) < 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(price.key)}
      className={
        'group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition ' +
        (selected
          ? 'border-gold-400/70 bg-slate-800/80 shadow-lg shadow-black/40 ring-1 ring-gold-400/40'
          : 'border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/70')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: price.accent }}
            />
            <span className="truncate text-sm font-medium text-slate-200">
              {price.name}
            </span>
          </div>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            {TYPE_LABEL[price.type]} · {price.currency}
          </span>
        </div>
        <span
          className={
            'tnum rounded-md px-1.5 py-0.5 text-xs font-semibold ' + rateColor(price.upDownRate)
          }
        >
          {rateArrow(price.upDownRate)} {formatRate(price.upDownRate)}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="tnum text-2xl font-semibold tracking-tight text-white">
            {formatPrice(price.price, price.precision)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{price.unit}</div>
        </div>
        <div className="w-[120px] shrink-0">
          {sparkline && sparkline.length > 1 && (
            <Sparkline points={sparkline} color={price.accent} />
          )}
        </div>
      </div>

      {/* directional edge accent */}
      <span
        className={
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 ' +
          (up
            ? 'bg-rose-400/60'
            : down
              ? 'bg-emerald-400/60'
              : 'bg-transparent')
        }
      />
    </button>
  );
}
