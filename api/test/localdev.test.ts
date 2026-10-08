import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { isLocalDev, requestOrigin } from '../src/lib/util';
import { makeEnv } from './helpers';

// With a custom-domain route, `wrangler dev` rewrites local URLs to the production host.
const localRewritten = (path: string, init: RequestInit = {}) =>
  new Request(`http://ss.siak.me${path}`, { ...init, headers: { 'cf-connecting-ip': '127.0.0.1', ...(init.headers as Record<string, string>) } });
const production = (path: string, init: RequestInit = {}) =>
  new Request(`https://ss.siak.me${path}`, { ...init, headers: { 'cf-connecting-ip': '203.0.113.7', ...(init.headers as Record<string, string>) } });

describe('local development detection', () => {
  it('detects local dev from loopback client IP even when the URL is rewritten', () => {
    expect(isLocalDev(localRewritten('/'))).toBe(true);
    expect(isLocalDev(production('/'))).toBe(false);
    expect(isLocalDev(new Request('http://localhost:8787/'))).toBe(true);
  });

  it('uses APP_URL as the public origin only in local dev', () => {
    const { env } = makeEnv({ APP_URL: 'http://localhost:8787' });
    expect(requestOrigin(env, localRewritten('/'))).toBe('http://localhost:8787');
    expect(requestOrigin(env, production('/'))).toBe('https://ss.siak.me');
  });

  it('never allows dev login in production, even if DEV_LOGIN is set', async () => {
    const { env } = makeEnv({ DEV_LOGIN: 'true', APP_URL: 'https://ss.siak.me' });
    const app = createApp();
    const body = JSON.stringify({ email: 'x@test.in' });
    const prod = await app.fetch(production('/api/auth/dev-login', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }), env);
    expect(prod.status).toBe(404);
    const cfg = await (await app.fetch(production('/api/config'), env)).json();
    expect((cfg as { devLogin: boolean }).devLogin).toBe(false);
  });

  it('allows dev login and same-site POSTs from localhost in local dev', async () => {
    const { env } = makeEnv({ DEV_LOGIN: 'true', APP_URL: 'http://localhost:8787' });
    const app = createApp();
    const res = await app.fetch(
      localRewritten('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email: 'x@test.in' }),
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const evil = await app.fetch(
      localRewritten('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example' } }),
      env,
    );
    expect(evil.status).toBe(403);
  });

  it('builds the Google callback URL from the public origin', async () => {
    const { env } = makeEnv({ APP_URL: 'http://localhost:8787' });
    const app = createApp();
    const local = await app.fetch(localRewritten('/api/auth/google'), env);
    expect(decodeURIComponent(local.headers.get('location') ?? '')).toContain('redirect_uri=http://localhost:8787/api/auth/google/callback');
    const prod = await app.fetch(production('/api/auth/google'), env);
    expect(decodeURIComponent(prod.headers.get('location') ?? '')).toContain('redirect_uri=https://ss.siak.me/api/auth/google/callback');
  });
});
