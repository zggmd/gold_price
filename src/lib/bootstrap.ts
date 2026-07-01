import { enableLegacyTls } from './legacy-tls';
import { startPoller } from './poller';

/**
 * Process-wide, once-only bootstrap: configure the legacy TLS dispatcher that
 * ICBC requires and start the background price poller.
 *
 * Why lazy (instead of instrumentation.ts)? `next dev` compiles
 * instrumentation.ts for the edge runtime too, where Node builtins
 * (`fs`/`path`/`crypto`) and native addons (`better-sqlite3`) can't be bundled.
 * Route handlers compile with the Node runtime, where those resolve fine, so we
 * trigger bootstrap as a side effect of importing this module from the API
 * routes. The poller therefore starts on the first request (in production the
 * Docker HEALTHCHECK hits /api/prices/latest every 30s, so it self-starts
 * shortly after boot).
 *
 * The globalThis guard survives dev HMR re-evaluation so we never start a
 * second poller loop.
 */
const g = globalThis as typeof globalThis & { __goldBootstrapped?: boolean };

if (!g.__goldBootstrapped) {
  g.__goldBootstrapped = true;
  enableLegacyTls();
  startPoller();
}
