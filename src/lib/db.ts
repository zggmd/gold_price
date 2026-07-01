import Database from 'better-sqlite3';
import type { Database as Db } from 'better-sqlite3';
import fs from 'fs';

import { config, resolveDbPath } from './config';
import type { HistoryPoint, LatestPrice } from './types';
import { metaForKey } from './metals';

// ---------------------------------------------------------------------------
// Schema
//
// Two-tier storage keeps the footprint light at scale:
//   - price_snapshots: high-frequency raw rows (one per metal per poll).
//     Pruned to RAW_RETENTION_HOURS, so its size is bounded regardless of how
//     long the service runs.
//   - price_hourly: OHLC rollup, one row per (metal, hour). Grows ~70k
//     rows/year for all 8 metals — trivial for SQLite, retained forever.
// A periodic maintenance job folds completed raw hours into price_hourly and
// deletes aged-out raw rows.
// ---------------------------------------------------------------------------

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS price_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  metal_key    TEXT    NOT NULL,
  metal_id     TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  currency     TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  price        REAL    NOT NULL,
  up_down_rate REAL,
  fetched_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_key_time ON price_snapshots(metal_key, fetched_at);
CREATE INDEX IF NOT EXISTS idx_snap_time     ON price_snapshots(fetched_at);

CREATE TABLE IF NOT EXISTS price_hourly (
  metal_key TEXT    NOT NULL,
  bucket    INTEGER NOT NULL,   -- hour start, ms epoch
  open      REAL    NOT NULL,
  high      REAL    NOT NULL,
  low       REAL    NOT NULL,
  close     REAL    NOT NULL,
  samples   INTEGER NOT NULL,
  PRIMARY KEY (metal_key, bucket)
);
`;

const HOUR_MS = 3_600_000;

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (dbInstance) return dbInstance;
  const dir = config.dataDir;
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolveDbPath());
  db.pragma('journal_mode = WAL'); // concurrent readers while the poller writes
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  dbInstance = db;
  return db;
}

// Allow tests / graceful shutdown to close the handle.
export function closeDb(): void {
  dbInstance?.close();
  dbInstance = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface SnapshotInput {
  metalKey: string;
  metalId: string;
  name: string;
  currency: string;
  type: string;
  price: number;
  upDownRate: number | null;
}

const INSERT_SNAPSHOT = /* sql */ `
  INSERT INTO price_snapshots
    (metal_key, metal_id, name, currency, type, price, up_down_rate, fetched_at)
  VALUES
    (@metalKey, @metalId, @name, @currency, @type, @price, @upDownRate, @fetchedAt)
`;

/** Insert a full poll batch atomically. All rows share one fetchedAt timestamp. */
export function insertSnapshot(rows: SnapshotInput[], fetchedAt: number): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(INSERT_SNAPSHOT);
  const tx = db.transaction((items: SnapshotInput[]) => {
    for (const r of items) {
      stmt.run({
        metalKey: r.metalKey,
        metalId: r.metalId,
        name: r.name,
        currency: r.currency,
        type: r.type,
        price: r.price,
        upDownRate: r.upDownRate,
        fetchedAt,
      });
    }
  });
  tx(rows);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface SnapshotRow {
  metal_key: string;
  metal_id: string;
  name: string;
  currency: string;
  type: string;
  price: number;
  up_down_rate: number | null;
  fetched_at: number;
}

function toLatest(row: SnapshotRow): LatestPrice | null {
  const meta = metaForKey(row.metal_key, row.name);
  if (!meta) return null;
  return {
    ...meta,
    price: row.price,
    upDownRate: row.up_down_rate,
    fetchedAt: row.fetched_at,
  };
}

/** Latest snapshot for every metal (all rows from the most recent batch). */
export function getLatest(): LatestPrice[] {
  const db = getDb();
  const at = db
    .prepare('SELECT MAX(fetched_at) AS t FROM price_snapshots')
    .get() as { t?: number } | undefined;
  if (!at?.t) return [];
  const rows = db
    .prepare('SELECT * FROM price_snapshots WHERE fetched_at = ?')
    .all(at.t) as SnapshotRow[];
  return rows.map(toLatest).filter((x): x is LatestPrice => x !== null);
}

function startOfHour(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/**
 * History for one metal over [from, to] (ms epoch), downsampled to at most
 * config.maxHistoryPoints. Uses raw snapshots for the recent window and the
 * hourly OHLC rollup (close price) for anything older, then merges.
 */
export function getHistory(
  metalKey: string,
  from: number,
  to: number,
): { points: HistoryPoint[]; source: 'raw' | 'merged' } {
  const db = getDb();
  const now = Date.now();
  const retentionMs = config.rawRetentionHours * HOUR_MS;
  const rawAvailableFrom = now - retentionMs;

  const out: HistoryPoint[] = [];

  // Hourly covers everything that has been rolled up (completed hours only).
  if (from < rawAvailableFrom) {
    const hourlyTo = Math.min(to, now);
    const rows = db
      .prepare(
        `SELECT bucket AS t, close AS price
         FROM price_hourly
         WHERE metal_key = ? AND bucket >= ? AND bucket <= ?
         ORDER BY bucket ASC`,
      )
      .all(metalKey, startOfHour(from), startOfHour(hourlyTo)) as HistoryPoint[];
    out.push(...rows);
  }

  // Raw covers the recent live window (and is authoritative when in range).
  const rawFrom = Math.max(from, rawAvailableFrom);
  if (rawFrom <= to) {
    const rows = db
      .prepare(
        `SELECT fetched_at AS t, price
         FROM price_snapshots
         WHERE metal_key = ? AND fetched_at >= ? AND fetched_at <= ?
         ORDER BY fetched_at ASC`,
      )
      .all(metalKey, rawFrom, to) as HistoryPoint[];
    out.push(...rows);
  }

  out.sort((a, b) => a.t - b.t);
  const source = from < rawAvailableFrom ? 'merged' : 'raw';
  return { points: downsample(out, config.maxHistoryPoints), source };
}

/** Even-stride sampling that always keeps the first and last point. */
function downsample(points: HistoryPoint[], maxPoints: number): HistoryPoint[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const result: HistoryPoint[] = [];
  for (let i = 0; i < points.length; i += stride) result.push(points[i]);
  // Guarantee the final point is present so the line reaches "now".
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

/** Earliest and latest timestamps + raw row count, for the page footer. */
export function getCoverage(): {
  earliest: number | null;
  latest: number | null;
  rawCount: number;
  hourlyCount: number;
} {
  const db = getDb();
  const raw = db
    .prepare(
      'SELECT MIN(fetched_at) AS mn, MAX(fetched_at) AS mx, COUNT(*) AS c FROM price_snapshots',
    )
    .get() as { mn: number | null; mx: number | null; c: number };
  const hourly = db
    .prepare('SELECT COUNT(*) AS c FROM price_hourly')
    .get() as { c: number };
  return {
    earliest: raw.mn,
    latest: raw.mx,
    rawCount: raw.c,
    hourlyCount: hourly.c,
  };
}

/**
 * The most recent N raw points per metal, in one query. Powers the mini
 * sparklines on the price cards. Returns {} if there is no data yet.
 */
export function getSparklines(perMetal = 48): Record<string, HistoryPoint[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metal_key, fetched_at AS t, price FROM (
        SELECT metal_key, fetched_at, price,
               ROW_NUMBER() OVER (
                 PARTITION BY metal_key ORDER BY fetched_at DESC
               ) AS rn
        FROM price_snapshots
      ) WHERE rn <= ? ORDER BY metal_key, t`,
    )
    .all(perMetal) as { metal_key: string; t: number; price: number }[];

  const out: Record<string, HistoryPoint[]> = {};
  for (const r of rows) {
    (out[r.metal_key] ??= []).push({ t: r.t, price: r.price });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Maintenance: fold completed raw hours into price_hourly, prune aged raw rows.
// ---------------------------------------------------------------------------

const AGGREGATE_SQL = /* sql */ `
  SELECT metal_key, bucket, open, high, low, close, samples FROM (
    SELECT
      metal_key,
      (fetched_at / ${HOUR_MS}) * ${HOUR_MS} AS bucket,
      FIRST_VALUE(price) OVER w AS open,
      LAST_VALUE(price)  OVER w AS close,
      MIN(price) OVER w AS low,
      MAX(price) OVER w AS high,
      COUNT(*)   OVER w AS samples,
      ROW_NUMBER() OVER w AS rn
    FROM price_snapshots
    WHERE fetched_at < ?
    WINDOW w AS (
      PARTITION BY metal_key, (fetched_at / ${HOUR_MS}) * ${HOUR_MS}
      ORDER BY fetched_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
  )
  WHERE rn = 1
`;

const UPSERT_HOURLY = /* sql */ `
  INSERT INTO price_hourly (metal_key, bucket, open, high, low, close, samples)
  VALUES (@metal_key, @bucket, @open, @high, @low, @close, @samples)
  ON CONFLICT(metal_key, bucket) DO UPDATE SET
    open = excluded.open,
    high = excluded.high,
    low  = excluded.low,
    close = excluded.close,
    samples = excluded.samples
`;

interface AggRow {
  metal_key: string;
  bucket: number;
  open: number;
  high: number;
  low: number;
  close: number;
  samples: number;
}

/** Idempotent: safe to call repeatedly. Returns rows rolled up this run. */
export function runMaintenance(): {
  rolledUp: number;
  pruned: number;
  cutoff: number;
} {
  const db = getDb();
  const now = Date.now();
  // Only fold *completed* hours — never the in-progress current hour.
  const completeBefore = startOfHour(now);
  const cutoff = now - config.rawRetentionHours * HOUR_MS;

  const agg = db.prepare(AGGREGATE_SQL).all(completeBefore) as AggRow[];
  const upsert = db.prepare(UPSERT_HOURLY);
  const prune = db.prepare('DELETE FROM price_snapshots WHERE fetched_at < ?');

  const tx = db.transaction(() => {
    for (const r of agg) upsert.run(r);
    const info = prune.run(cutoff);
    return info.changes;
  });

  const pruned = tx();
  return { rolledUp: agg.length, pruned, cutoff };
}
