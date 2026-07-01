import { NextResponse } from 'next/server';

import { getCoverage, getLatest, getSparklines } from '@/lib/db';
import { METALS } from '@/lib/metals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/prices/latest
 * The most recent persisted snapshot for every metal, plus the static metal
 * registry, per-metal sparklines, and DB coverage stats. This is what the
 * dashboard loads first.
 */
export async function GET() {
  const prices = getLatest();
  const coverage = getCoverage();
  const sparklines = getSparklines(48);
  return NextResponse.json({
    metals: METALS,
    prices,
    sparklines,
    fetchedAt: coverage.latest,
    coverage,
  });
}
