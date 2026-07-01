import { config } from './config';
import { enableLegacyTls } from './legacy-tls';
import type { IcbcResponse } from './types';

/**
 * Fetch the live precious-metal price list from ICBC.
 *
 * Anti-abuse considerations baked in:
 *   - realistic browser User-Agent + Chinese Accept-Language
 *   - Referer set to ICBC's own site
 *   - caller supplies an AbortSignal so a stuck request is hard-killed
 *   - no-cache so we always get a fresh quote
 */
export async function fetchIcbcPrices(signal?: AbortSignal): Promise<IcbcResponse> {
  enableLegacyTls(); // idempotent; needed for ICBC's legacy TLS renegotiation
  const res = await fetch(config.icbcUrl, {
    headers: {
      'User-Agent': config.userAgent,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: 'https://www.icbc.com.cn/',
    },
    signal,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`ICBC HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as IcbcResponse;
  if (json.code !== 0 || !Array.isArray(json.data)) {
    throw new Error(
      `ICBC unexpected payload: code=${json.code} message=${json.message}`,
    );
  }
  return json;
}
