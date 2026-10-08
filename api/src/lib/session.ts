import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Role } from '../../../shared/types';
import type { AppEnv, Env, SessionUser } from '../env';
import { fail } from './util';

export const SESSION_COOKIE = 'ss_session';
const SESSION_TTL_S = 30 * 24 * 3600;

function secret(env: Env): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) fail(500, 'JWT_SECRET is not configured');
  return env.JWT_SECRET;
}

function isSecure(c: Context) {
  return new URL(c.req.url).protocol === 'https:';
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const iat = Math.floor(Date.now() / 1000);
  const token = await sign({ sub: userId, iat, exp: iat + SESSION_TTL_S }, secret(c.env), 'HS256');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

export function clearSession(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: isSecure(c) });
}

export async function loadSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  let sub: string;
  try {
    const payload = await verify(token, secret(c.env), 'HS256');
    sub = String(payload.sub);
  } catch {
    return null;
  }
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, suspended_reason, avatar_url, locale FROM users WHERE id = ?',
  )
    .bind(sub)
    .first<SessionUser>();
  return user ?? null;
}

/** Requires a signed-in, non-suspended user. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await loadSessionUser(c);
  if (!user) fail(401, 'Please sign in');
  if (user.status === 'suspended') fail(403, 'Your account is suspended');
  c.set('user', user);
  await next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user?.role || !roles.includes(user.role)) fail(403, 'You do not have access to this resource');
    await next();
  };
}
