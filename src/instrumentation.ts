/**
 * Runs once when the Next.js server boots. We use it to:
 *   1. install the legacy-TLS dispatcher ICBC requires, and
 *   2. start the background poller that records prices on a fixed cadence.
 *
 * Guards:
 *   - NEXT_RUNTIME !== 'nodejs'  → skip the edge runtime bundle.
 *   - DISABLE_GOLD_POLLER=true   → skip starting the poller during `next build`
 *     (the Dockerfile sets this for the build stage and clears it at runtime).
 *     Legacy TLS is still configured so the /api/prices/now live route works.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { enableLegacyTls } = await import('./lib/legacy-tls');
  enableLegacyTls();

  if (process.env.DISABLE_GOLD_POLLER === 'true') return;

  const { startPoller } = await import('./lib/poller');
  startPoller();
}
