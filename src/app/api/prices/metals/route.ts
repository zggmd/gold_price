import { NextResponse } from 'next/server';

import '@/lib/bootstrap'; // side effect: ensures TLS + poller are running
import { getCoverage } from '@/lib/db';
import { METALS } from '@/lib/metals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/prices/metals
 * Static metadata for all supported metals + DB coverage stats. Handy for
 * clients that just want to render the metal list without prices.
 */
export async function GET() {
  return NextResponse.json({ metals: METALS, coverage: getCoverage() });
}
