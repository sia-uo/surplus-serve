import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv, Env } from '../env';
import { clearSession, createSession } from '../lib/session';
import { rateLimit } from '../lib/ratelimit';
import { adminEmails, fail, isLocalDev, newId, now, parse, readJson, requestOrigin } from '../lib/util';

const STATE_COOKIE = 'ss_oauth';

export const auth = new Hono<AppEnv>();

auth.use('*', rateLimit('auth', 30, 60_000));

function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

/** Upsert a user by email; admins listed in ADMIN_EMAILS always get the admin role. */
export async function upsertUser(env: Env, info: { email: string; name: string; picture?: string | null; sub?: string | null }) {
  const email = info.email.toLowerCase();
  const isAdmin = adminEmails(env).includes(email);
  const t = now();
  const existing = await env.DB.prepare('SELECT id, role FROM users WHERE email = ?').bind(email).first<{ id: string; role: string | null }>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET name = COALESCE(NULLIF(?, ''), name), avatar_url = COALESCE(?, avatar_url),
         google_sub = COALESCE(?, google_sub), last_login_at = ?, role = CASE WHEN ? THEN 'admin' ELSE role END
       WHERE id = ?`,
    )
      .bind(info.name, info.picture ?? null, info.sub ?? null, t, isAdmin ? 1 : 0, existing.id)
      .run();
    return { id: existing.id, role: isAdmin ? 'admin' : existing.role };
  }
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar_url, google_sub, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, info.name || email.split('@')[0], info.picture ?? null, info.sub ?? null, isAdmin ? 'admin' : null, t, t)
    .run();
  return { id, role: isAdmin ? 'admin' : null };
}

auth.get('/google', (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) fail(503, 'Google Sign-In is not configured');
  const state = newId();
  const next = safeNext(c.req.query('next'));
  const secure = new URL(requestOrigin(c.env, c.req.raw)).protocol === 'https:';
  setCookie(c, STATE_COOKIE, `${state}|${next}`, { httpOnly: true, secure, sameSite: 'Lax', path: '/api/auth', maxAge: 600 });
  const origin = requestOrigin(c.env, c.req.raw);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/google/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return c.redirect(url.toString());
});

auth.get('/google/callback', async (c) => {
  const origin = requestOrigin(c.env, c.req.raw);
  const cookie = getCookie(c, STATE_COOKIE) ?? '';
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth' });
  const [expectedState, next] = cookie.split('|');
  const code = c.req.query('code');
  if (!code || !expectedState || c.req.query('state') !== expectedState) return c.redirect('/login?error=state');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: c.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return c.redirect('/login?error=token');
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return c.redirect('/login?error=token');

  // The ID token came straight from Google's token endpoint over TLS, so its
  // signature need not be re-verified (per Google's OpenID guidance); we still check claims.
  let claims: { email?: string; email_verified?: boolean; name?: string; picture?: string; sub?: string; aud?: string; iss?: string; exp?: number };
  try {
    const part = id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (ch) => ch.charCodeAt(0))));
  } catch {
    return c.redirect('/login?error=token');
  }
  if (
    !claims.email ||
    !claims.email_verified ||
    claims.aud !== c.env.GOOGLE_CLIENT_ID ||
    !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss ?? '') ||
    (claims.exp ?? 0) * 1000 < Date.now()
  ) {
    return c.redirect('/login?error=email');
  }

  const user = await upsertUser(c.env, { email: claims.email, name: claims.name ?? '', picture: claims.picture, sub: claims.sub });
  await createSession(c, user.id);
  return c.redirect(user.role ? safeNext(next) : '/onboarding');
});

auth.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

/** Local development only: sign in by email without Google (requires DEV_LOGIN=true and localhost). */
auth.post('/dev-login', async (c) => {
  if (c.env.DEV_LOGIN !== 'true' || !isLocalDev(c.req.raw)) fail(404, 'Not found');
  const body = parse(z.object({ email: z.email(), name: z.string().max(100).optional() }), await readJson(c.req.raw));
  const user = await upsertUser(c.env, { email: body.email, name: body.name ?? '' });
  await createSession(c, user.id);
  return c.json({ ok: true, role: user.role });
});
