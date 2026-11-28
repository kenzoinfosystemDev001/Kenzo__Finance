/**
 * Forwarding the browser's address to the API.
 *
 * The API only ever sees this Next.js server, so without help every user
 * shares one rate-limit bucket and audit logs record the web server's IP.
 * When INTERNAL_PROXY_TOKEN is set (same value as the API's), outgoing API
 * calls carry the browser's address in `x-client-ip`, vouched for by
 * `x-internal-proxy-token`. The API ignores the address without the token.
 *
 * No imports: middleware (edge runtime) uses this as well as server code.
 */

const MIN_TOKEN_LENGTH = 32;
/** Longest textual IPv6 address (with an embedded IPv4 part). */
const MAX_IP_LENGTH = 45;

type HeaderReader = { get(name: string): string | null };

/**
 * The browser's address as seen by the nearest trusted reverse proxy.
 *
 * X-Forwarded-For is appended to by each proxy, and its left end is whatever
 * the browser chose to send, so it is read from the right: with
 * TRUSTED_PROXY_HOPS proxies in front of this server (default 1, e.g. an AWS
 * ALB), the entry that many places from the end is the one the outermost
 * proxy observed. X-Real-IP is used only when there is no X-Forwarded-For.
 */
export function clientIpFrom(headers: HeaderReader): string | null {
  const forwardedFor = headers.get('x-forwarded-for');
  let candidate: string | undefined;

  if (forwardedFor) {
    const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1);
    const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean);
    candidate = entries.length >= hops ? entries[entries.length - hops] : entries[0];
  } else {
    candidate = headers.get('x-real-ip')?.trim();
  }

  // The API validates the address properly; this just keeps junk out of headers.
  if (!candidate || candidate.length > MAX_IP_LENGTH || !/^[0-9a-fA-F:.]+$/.test(candidate)) {
    return null;
  }
  return candidate;
}

/** Headers to add to an API call made on behalf of the given request. */
export function forwardingHeadersFrom(headers: HeaderReader): Record<string, string> {
  const token = process.env.INTERNAL_PROXY_TOKEN;
  if (!token || token.length < MIN_TOKEN_LENGTH) return {};

  const ip = clientIpFrom(headers);
  if (!ip) return {};
  return { 'x-client-ip': ip, 'x-internal-proxy-token': token };
}
