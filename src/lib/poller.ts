import { config, resolveDbPath } from './config';
import { fetchIcbcPrices } from './icbc';
import { buildMetalMeta } from './metals';
import { closeDb, insertSnapshot, runMaintenance, type SnapshotInput } from './db';

export interface PollResult {
  ok: boolean;
  count: number;
  fetchedAt?: number;
  error?: string;
}

let started = false;
let timer: NodeJS.Timeout | null = null;
let lastMaintenance = 0;
let consecutiveFailures = 0;

/** One poll cycle: fetch ICBC, normalize, persist a snapshot batch. */
export async function pollOnce(): Promise<PollResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.pollTimeoutMs);
  const fetchedAt = Date.now();

  try {
    const resp = await fetchIcbcPrices(controller.signal);
    const rows: SnapshotInput[] = [];
    for (const item of resp.data) {
      const meta = buildMetalMeta(item);
      if (!meta) continue; // skip anything we don't know how to model
      const price = Number(item.zjj);
      if (!Number.isFinite(price)) continue;
      const upDownRate =
        item.upDownRate != null && item.upDownRate !== ''
          ? Number(item.upDownRate)
          : null;
      rows.push({
        metalKey: meta.key,
        metalId: meta.id,
        name: meta.name,
        currency: meta.currency,
        type: meta.type,
        price,
        upDownRate: Number.isFinite(upDownRate as number) ? (upDownRate as number) : null,
      });
    }
    if (rows.length === 0) throw new Error('no valid prices in ICBC response');

    insertSnapshot(rows, fetchedAt);
    consecutiveFailures = 0;
    return { ok: true, count: rows.length, fetchedAt };
  } catch (err) {
    consecutiveFailures += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poller] fetch failed (#${consecutiveFailures}): ${message}`);
    return { ok: false, count: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Compute the delay until the next poll. Applies two defenses against looking
 * like a malicious client:
 *   - exponential backoff (up to 4x) after consecutive failures, so a flaky or
 *     rate-limiting upstream isn't hammered,
 *   - ± jitter so requests don't land on a perfectly fixed cadence.
 */
function nextDelayMs(): number {
  const base = config.pollIntervalSeconds * 1000;
  const backoff = consecutiveFailures > 0 ? Math.min(consecutiveFailures, 4) : 0;
  let delay = base * (1 + backoff);
  const j = config.pollJitterRatio;
  if (j > 0) {
    delay *= 1 + (Math.random() * 2 - 1) * j;
  }
  return Math.max(1000, Math.round(delay));
}

async function tick(): Promise<void> {
  await pollOnce();

  const now = Date.now();
  if (now - lastMaintenance >= config.maintenanceIntervalMinutes * 60_000) {
    lastMaintenance = now;
    try {
      const res = runMaintenance();
      console.log(
        `[poller] maintenance: rolledUp=${res.rolledUp} pruned=${res.pruned}`,
      );
    } catch (err) {
      console.error('[poller] maintenance error:', err);
    }
  }

  timer = setTimeout(tick, nextDelayMs());
}

/**
 * Start the background poller. Idempotent — safe to call more than once.
 * Fires one poll immediately so the DB isn't empty on first boot, then reschedules.
 */
export function startPoller(): void {
  if (started) return;
  started = true;
  console.log(
    `[poller] starting (interval=${config.pollIntervalSeconds}s, ` +
      `retention=${config.rawRetentionHours}h, db=${resolveDbPath()})`,
  );
  lastMaintenance = 0;
  setTimeout(tick, 0);

  // Clean shutdown: stop the loop and close the DB so the container exits fast.
  const shutdown = (sig: string) => {
    console.log(`[poller] received ${sig}, shutting down`);
    stopPoller();
    closeDb();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

export function stopPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  started = false;
}
