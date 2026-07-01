import { NextResponse } from 'next/server';

import '@/lib/bootstrap'; // side effect: ensures TLS + poller are running
import { getHistory } from '@/lib/db';
import { METAL_BY_KEY } from '@/lib/metals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANGES = {
  '1h': 3_600_000,
  '6h': 6 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
  '30d': 30 * 24 * 3_600_000,
  '90d': 90 * 24 * 3_600_000,
  all: null as number | null,
} as const;

export type HistoryRange = keyof typeof RANGES;

/**
 * GET /api/prices/history?metal=cny-gold&range=24h
 *   metal: a metal key (default cny-gold)
 *   range: one of 1h|6h|24h|7d|30d|90d|all (default 24h)
 *
 * Returns server-side downsampled points to keep payloads small regardless of
 * how long the service has been running.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const metal = searchParams.get('metal') ?? 'cny-gold';
  const rangeParam = (searchParams.get('range') ?? '24h') as HistoryRange;

  const meta = METAL_BY_KEY[metal];
  if (!meta) {
    return NextResponse.json(
      { error: `unknown metal "${metal}"` },
      { status: 400 },
    );
  }

  const range = rangeParam in RANGES ? rangeParam : '24h';
  const to = Date.now();
  const span = RANGES[range];
  const from = span == null ? 0 : to - span;

  const { points, source } = getHistory(metal, from, to);
  return NextResponse.json({
    metal: meta,
    range,
    source,
    points,
  });
}
