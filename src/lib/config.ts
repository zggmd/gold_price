import path from 'path';

/**
 * All runtime knobs are env-driven so the same image can be tuned per deployment
 * without rebuilding. Every numeric value is clamped to a sane floor so a typo
 * can't turn the poller into a request flood against ICBC.
 */
function num(key: string, def: number, min?: number, max?: number): number {
  const raw = process.env[key];
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let v = n;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
}

function str(key: string, def: string): string {
  const v = process.env[key];
  return v == null || v === '' ? def : v;
}

export const config = {
  /** Port the Next.js server listens on. */
  port: num('PORT', 3000, 1, 65535),

  /** Upstream ICBC endpoint. Overridable for testing/proxies. */
  icbcUrl: str(
    'ICBC_URL',
    'https://papi.icbc.com.cn/wapDynamicPage/goldMarket/accList',
  ),

  /**
   * Polling cadence in seconds. Default 30s per requirement. Floored at 5s so a
   * misconfiguration can't hammer the upstream — this is the main lever for
   * "don't look like a malicious client".
   */
  pollIntervalSeconds: num('POLL_INTERVAL_SECONDS', 30, 5, 86_400),

  /** Per-request timeout. Keeps a stuck upstream from piling up sockets. */
  pollTimeoutMs: num('POLL_TIMEOUT_MS', 8_000, 1_000, 60_000),

  /**
   * Successful /api/prices/now responses are reused for this many seconds.
   * The same window is used as a short retry cooldown after an upstream error.
   */
  nowCacheSeconds: num('NOW_CACHE_SECONDS', 10, 1, 300),

  /**
   * ± jitter ratio applied to every schedule. 0.15 means each tick lands
   * somewhere in [interval*0.85, interval*1.15]. Randomized spacing reads far
   * less like a fixed-cron bot to upstream WAFs.
   */
  pollJitterRatio: num('POLL_JITTER_RATIO', 0.15, 0, 0.5),

  /**
   * How long high-frequency raw snapshots are kept before being pruned. Older
   * data survives forever as hourly OHLC aggregates, so lowering this shrinks
   * storage without losing history.
   */
  rawRetentionHours: num('RAW_RETENTION_HOURS', 72, 1, 24_000),

  /** How often raw→hourly rollup + pruning runs. */
  maintenanceIntervalMinutes: num('MAINTENANCE_INTERVAL_MINUTES', 60, 1, 24_000),

  /** Directory holding the SQLite file (mount this as a volume in Docker). */
  dataDir: str('DATA_DIR', './data'),

  /** Explicit DB file path; defaults to <dataDir>/gold.sqlite. */
  dbPath: str('DB_PATH', ''),

  /** Max points returned by the history API (server-side downsampled). */
  maxHistoryPoints: num('MAX_HISTORY_POINTS', 400, 50, 5_000),

  /** User-Agent sent to ICBC — a realistic desktop browser string. */
  userAgent: str(
    'USER_AGENT',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ),

  /**
   * Whether to enable OpenSSL legacy server connect. Required by the default
   * ICBC endpoint; opt out only if ICBC_URL points somewhere that doesn't need it.
   */
  allowLegacyTls: process.env.DISABLE_LEGACY_TLS !== 'true',
} as const;

export function resolveDbPath(): string {
  return config.dbPath || path.join(config.dataDir, 'gold.sqlite');
}
