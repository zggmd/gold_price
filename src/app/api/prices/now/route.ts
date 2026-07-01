import { NextResponse } from 'next/server';

import '@/lib/bootstrap'; // side effect: ensures TLS + poller are running
import { fetchIcbcPrices } from '@/lib/icbc';
import { buildMetalMeta } from '@/lib/metals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/prices/now
 * Live pass-through to ICBC for a true real-time read (independent of the
 * poller cadence). Used by the dashboard's "refresh now" button. Failures
 * return 502 so the UI can fall back to the latest persisted snapshot.
 */
export async function GET() {
  try {
    const resp = await fetchIcbcPrices();
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
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json({ fetchedAt, prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'failed to fetch live prices', detail: message },
      { status: 502 },
    );
  }
}
