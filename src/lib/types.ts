// Shared domain types for the gold-price service.

export type Currency = 'CNY' | 'USD';
export type MetalType = 'gold' | 'silver' | 'platinum' | 'palladium';

/** Static descriptor of a single tradeable metal (e.g. CNY account gold). */
export interface MetalMeta {
  /** ICBC item id, e.g. "901001" */
  id: string;
  /** ICBC dataId, e.g. "901" */
  dataId: string;
  /** Normalized stable key, e.g. "cny-gold" — used everywhere as the identifier. */
  key: string;
  /** Chinese display name from ICBC, e.g. "人民币账户黄金". */
  name: string;
  currency: Currency;
  type: MetalType;
  /** Display unit, e.g. "元/克" or "美元/盎司". */
  unit: string;
  /** Suggested decimal places for display. */
  precision: number;
  /** Chart accent color (hex). */
  accent: string;
}

/** A single priced metal at a point in time. */
export interface PriceSnapshot {
  metalKey: string;
  price: number;
  upDownRate: number | null;
  fetchedAt: number; // ms epoch
}

/** Latest price joined with its metal metadata — what the UI cards consume. */
export interface LatestPrice extends MetalMeta {
  price: number;
  upDownRate: number | null;
  fetchedAt: number; // ms epoch of the snapshot batch
}

/** A point on a history chart. */
export interface HistoryPoint {
  t: number; // ms epoch
  price: number;
}

/** Raw ICBC API list item. */
export interface IcbcItem {
  id: string;
  bz: string;
  zjj: string;
  upDownRate: string;
  textColor?: string;
  dataId: string;
}

export interface IcbcResponse {
  code: number;
  message: string;
  data: IcbcItem[];
}
