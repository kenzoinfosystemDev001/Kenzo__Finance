import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { clientIp } from '../utils/client-ip';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/**
 * Rate limiting keyed by who is calling, not by socket address.
 *
 * Every request reaches the API from the Next.js server, so `req.ip` is the
 * same for the whole organisation: keyed by IP, one user mistyping a
 * password ten times (or a busy office making 120 calls a minute) returned
 * 429 to everyone. This guard runs before authentication, so it keys on what
 * the request carries:
 *
 * - a bearer token: its hash (a caller cannot land in another user's bucket
 *   without holding that user's token; forged tokens are rejected anyway)
 * - sign-in: the e-mail being tried, so brute force on one account is still
 *   capped at the login limit
 * - refresh: the refresh token's hash
 * - anything else: the client address (the browser's, when the Next.js
 *   server vouches for it with INTERNAL_PROXY_TOKEN - see client-ip.ts)
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authorization: unknown = req.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return `token:${digest(authorization.slice(7))}`;
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (typeof body?.email === 'string' && body.email.trim()) {
      return `email:${digest(body.email.trim().toLowerCase())}`;
    }
    if (typeof body?.refreshToken === 'string' && body.refreshToken) {
      return `refresh:${digest(body.refreshToken)}`;
    }

    return `ip:${clientIp(req) ?? 'unknown'}`;
  }
}
