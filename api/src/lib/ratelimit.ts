import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { fail } from './util';

/**
 * Lightweight fixed-window rate limiter kept in isolate memory.
 * Costs zero D1 reads/writes (important on the free tier). Limits are per
 * isolate, so they are approximate — good enough to stop casual abuse of
 * public endpoints; hard ceilings (email quota, Nominatim spacing) live in D1.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

export function hit(key: string, limit: number, windowMs: number, nowMs = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= nowMs) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= nowMs) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function resetRateLimits() {
  buckets.clear();
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
}

export function rateLimit(name: string, limit: number, windowMs: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = `${name}:${clientIp(c.req.raw)}`;
    if (!hit(key, limit, windowMs)) {
      c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
      fail(429, 'Too many requests, please slow down');
    }
    await next();
  };
}
