import type { Currency, IcbcItem, MetalMeta, MetalType } from './types';

/** dataId middle two digits → metal type. */
const METAL_BY_CODE: Record<string, MetalType> = {
  '01': 'gold',
  '03': 'silver',
  '05': 'platinum',
  '07': 'palladium',
};

interface MetalDisplay {
  unit: string;
  precision: number;
  accent: string;
  /** Short Chinese label used for chips/tabs. */
  shortName: string;
}

/**
 * Display props per (currency, metal). Units reflect ICBC account-metal quoting:
 * CNY metals are 元/克, USD metals are 美元/盎司.
 */
const DISPLAY: Record<Currency, Record<MetalType, MetalDisplay>> = {
  CNY: {
    gold: { unit: '元/克', precision: 2, accent: '#f59e0b', shortName: '黄金' },
    silver: { unit: '元/克', precision: 3, accent: '#94a3b8', shortName: '白银' },
    platinum: { unit: '元/克', precision: 2, accent: '#cbd5e1', shortName: '铂金' },
    palladium: { unit: '元/克', precision: 2, accent: '#a78bfa', shortName: '钯金' },
  },
  USD: {
    gold: { unit: '美元/盎司', precision: 2, accent: '#fbbf24', shortName: '黄金' },
    silver: { unit: '美元/盎司', precision: 4, accent: '#cbd5e1', shortName: '白银' },
    platinum: { unit: '美元/盎司', precision: 2, accent: '#e2e8f0', shortName: '铂金' },
    palladium: { unit: '美元/盎司', precision: 4, accent: '#c4b5fd', shortName: '钯金' },
  },
};

export function deriveCurrency(dataId: string): Currency | null {
  const c = dataId[0];
  if (c === '9') return 'CNY';
  if (c === '8') return 'USD';
  return null;
}

export function deriveMetalType(dataId: string): MetalType | null {
  if (dataId.length < 3) return null;
  return METAL_BY_CODE[dataId.slice(1, 3)] ?? null;
}

function buildMeta(
  id: string,
  dataId: string,
  name: string,
  currency: Currency,
  type: MetalType,
): MetalMeta {
  const d = DISPLAY[currency][type];
  return {
    id,
    dataId,
    key: `${currency.toLowerCase()}-${type}`,
    name,
    currency,
    type,
    unit: d.unit,
    precision: d.precision,
    accent: d.accent,
  };
}

/**
 * The eight metals ICBC publishes. This is the canonical UI ordering and lets the
 * page render correctly even before the first poll lands any data.
 */
export const METALS: MetalMeta[] = [
  buildMeta('901001', '901', '人民币账户黄金', 'CNY', 'gold'),
  buildMeta('903001', '903', '人民币账户白银', 'CNY', 'silver'),
  buildMeta('905001', '905', '人民币账户铂金', 'CNY', 'platinum'),
  buildMeta('907001', '907', '人民币账户钯金', 'CNY', 'palladium'),
  buildMeta('801014', '801', '美元账户黄金', 'USD', 'gold'),
  buildMeta('803014', '803', '美元账户白银', 'USD', 'silver'),
  buildMeta('805014', '805', '美元账户铂金', 'USD', 'platinum'),
  buildMeta('807014', '807', '美元账户钯金', 'USD', 'palladium'),
];

export const METAL_BY_KEY: Record<string, MetalMeta> = Object.fromEntries(
  METALS.map((m) => [m.key, m]),
);

/** Metadata for a metal, preferring the live ICBC name when available. */
export function metaForKey(key: string, liveName?: string): MetalMeta | undefined {
  const base = METAL_BY_KEY[key];
  if (!base) return undefined;
  return liveName && liveName !== base.name ? { ...base, name: liveName } : base;
}

/** Normalize a raw ICBC item into a MetalMeta, or null if we don't recognize it. */
export function buildMetalMeta(item: IcbcItem): MetalMeta | null {
  const currency = deriveCurrency(item.dataId);
  const type = deriveMetalType(item.dataId);
  if (!currency || !type) return null;
  return buildMeta(item.id, item.dataId, item.bz, currency, type);
}
