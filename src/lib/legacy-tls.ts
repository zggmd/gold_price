import crypto from 'crypto';
import { Agent, setGlobalDispatcher } from 'undici';

import { config } from './config';

let configured = false;

/**
 * ICBC's TLS endpoint requires "unsafe legacy renegotiation"
 * (SSL_OP_LEGACY_SERVER_CONNECT). Modern Node / OpenSSL 3 disables this by
 * default, so a plain fetch() aborts with
 * ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED (curl works because its defaults
 * differ). This installs a global undici dispatcher that re-enables the option
 * process-wide.
 *
 * Certificate validation is NOT weakened — rejectUnauthorized stays true; we
 * only permit the legacy renegotiation handshake the upstream needs.
 *
 * Idempotent. Set DISABLE_LEGACY_TLS=true to opt out (e.g. when pointing
 * ICBC_URL at a modern proxy that doesn't need it).
 */
export function enableLegacyTls(): void {
  if (configured) return;
  if (!config.allowLegacyTls) return;
  configured = true;
  setGlobalDispatcher(
    new Agent({
      connect: {
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
    }),
  );
  console.log('[tls] enabled SSL_OP_LEGACY_SERVER_CONNECT for upstream ICBC');
}
