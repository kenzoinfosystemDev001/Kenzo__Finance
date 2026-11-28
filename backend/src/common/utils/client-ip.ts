import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

/** Header carrying the browser's address, set by the Next.js server. */
export const CLIENT_IP_HEADER = 'x-client-ip';
/** Shared secret proving the header above came from our own Next.js server. */
export const PROXY_TOKEN_HEADER = 'x-internal-proxy-token';
/** Shorter tokens are treated as unset: the feature stays off. */
export const MIN_PROXY_TOKEN_LENGTH = 32;

interface RequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual needs equal lengths; the length itself is not secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The address of the person behind a request.
 *
 * Browsers never call the API directly: the Next.js server does, so `req.ip`
 * is that server's address for every user. The Next server therefore forwards
 * the browser's address in `x-client-ip`, together with `x-internal-proxy-token`.
 * The forwarded address is believed ONLY when that token equals
 * INTERNAL_PROXY_TOKEN (compared in constant time) and the value is a valid IP;
 * anyone else calling the API cannot choose the address that audit logs record
 * or the rate-limit bucket they land in. In every other case: `req.ip`.
 */
export function clientIp(
  request: RequestLike,
  expectedToken: string | undefined = process.env.INTERNAL_PROXY_TOKEN,
): string | null {
  const fallback = request.ip ?? null;
  if (!expectedToken || expectedToken.length < MIN_PROXY_TOKEN_LENGTH) return fallback;

  const presented = single(request.headers?.[PROXY_TOKEN_HEADER]);
  if (!presented || !tokensMatch(presented, expectedToken)) return fallback;

  const forwarded = single(request.headers?.[CLIENT_IP_HEADER])?.trim();
  if (!forwarded || forwarded.length > 45 || isIP(forwarded) === 0) return fallback;
  return forwarded;
}
