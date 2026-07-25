import { NextResponse } from 'next/server';

import '@/lib/bootstrap'; // side effect: ensures TLS + poller are running
import { config } from '@/lib/config';
import { fetchIcbcPrices } from '@/lib/icbc';
import { buildMetalMeta } from '@/lib/metals';
import type { LatestPrice } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface LivePayload {
  fetchedAt: number;
  prices: LatestPrice[];
}

interface LiveCache {
  value: LivePayload | null;
  expiresAt: number;
  cooldownUntil: number;
  inFlight: Promise<LivePayload> | null;
}

const globalCache = globalThis as typeof globalThis & {
  __goldLiveCache?: LiveCache;
};

// Keep the cache across route re-evaluation in development, just like bootstrap.
const liveCache =
  globalCache.__goldLiveCache ??
  (globalCache.__goldLiveCache = {
    value: null,
    expiresAt: 0,
    cooldownUntil: 0,
    inFlight: null,
  });

const CACHE_MS = config.nowCacheSeconds * 1000;

function cacheHeaders(status: 'HIT' | 'MISS' | 'COALESCED') {
  return {
    // The route owns the cache. Browsers and shared proxies should always ask it
    // so the server-side cooldown cannot be bypassed by inconsistent client TTLs.
    'Cache-Control': 'no-store',
    'X-Live-Price-Cache': status,
  };
}

async function loadLivePrices(): Promise<LivePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.pollTimeoutMs);

  try {
    const resp = await fetchIcbcPrices(controller.signal);
    const fetchedAt = Date.now();
    const prices = resp.data
      .map((item) => {
        const meta = buildMetalMeta(item);
        if (!meta) return null;
        const price = Number(item.zjj);
        if (!Number.isFinite(price)) return null;
        const upDownRate =
          item.upDownRate != null && item.upDownRate !== ''
            ? Number(item.upDownRate)
            : null;
        return {
          ...meta,
          price,
          upDownRate: Number.isFinite(upDownRate as number)
            ? (upDownRate as number)
            : null,
          fetchedAt,
        };
      })
      .filter((p): p is LatestPrice => p !== null);

    if (prices.length === 0) {
      throw new Error('no valid prices in ICBC response');
    }
    return { fetchedAt, prices };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /api/prices/now
 * Short-lived server cache around the ICBC live read. Requests inside the
 * cooldown window reuse the latest successful value, and concurrent cache
 * misses share one upstream request. An upstream failure also starts a short
 * cooldown so repeated client retries cannot hammer ICBC.
 */
export async function GET() {
  const now = Date.now();
  if (liveCache.value && now < liveCache.expiresAt) {
    return NextResponse.json(
      { ...liveCache.value, cached: true },
      { headers: cacheHeaders('HIT') },
    );
  }

  if (!liveCache.inFlight && now < liveCache.cooldownUntil) {
    const retryAfter = Math.max(
      1,
      Math.ceil((liveCache.cooldownUntil - now) / 1000),
    );
    return NextResponse.json(
      {
        error: 'live price request is cooling down',
        retryAfter,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfter),
        },
      },
    );
  }

  const joinedExistingRequest = liveCache.inFlight !== null;
  if (!liveCache.inFlight) {
    const request = loadLivePrices();
    liveCache.inFlight = request;
    request
      .then((payload) => {
        liveCache.value = payload;
        liveCache.expiresAt = Date.now() + CACHE_MS;
        liveCache.cooldownUntil = 0;
      })
      .catch(() => {
        liveCache.cooldownUntil = Date.now() + CACHE_MS;
      })
      .finally(() => {
        if (liveCache.inFlight === request) liveCache.inFlight = null;
      });
  }

  const request = liveCache.inFlight;
  if (!request) {
    return NextResponse.json(
      { error: 'failed to initialize live price request' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const payload = await request;
    return NextResponse.json(
      { ...payload, cached: joinedExistingRequest },
      {
        headers: cacheHeaders(
          joinedExistingRequest ? 'COALESCED' : 'MISS',
        ),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'failed to fetch live prices', detail: message },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(config.nowCacheSeconds),
        },
      },
    );
  }
}
