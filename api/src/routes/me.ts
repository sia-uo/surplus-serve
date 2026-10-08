import { Hono } from 'hono';
import type { MeResponse } from '../../../shared/types';
import type { AppEnv } from '../env';
import { sendEmail, templates } from '../lib/email';
import { toNgo, toRestaurant, toUser } from '../lib/mappers';
import { loadSessionUser, requireAuth } from '../lib/session';
import { localeSchema, roleSchema } from '../lib/schemas';
import { appUrl, fail, parse, readJson } from '../lib/util';

export const me = new Hono<AppEnv>();

/** Current user + profile. Works for suspended users too so the UI can explain why. */
me.get('/', async (c) => {
  const user = await loadSessionUser(c);
  const res: MeResponse = { user: null, restaurant: null, ngo: null };
  if (!user) return c.json(res);
  res.user = toUser(user);
  if (user.role === 'restaurant') {
    const r = await c.env.DB.prepare('SELECT * FROM restaurants WHERE user_id = ?').bind(user.id).first();
    res.restaurant = r ? toRestaurant(r) : null;
  } else if (user.role === 'ngo') {
    const n = await c.env.DB.prepare('SELECT * FROM ngos WHERE user_id = ?').bind(user.id).first();
    res.ngo = n ? toNgo(n) : null;
  }
  c.header('Cache-Control', 'no-store');
  return c.json(res);
});

/** First login: choose Restaurant or NGO (only once). */
me.post('/role', requireAuth, async (c) => {
  const user = c.get('user');
  const { role } = parse(roleSchema, await readJson(c.req.raw));
  if (user.role) fail(409, 'Your role is already set');
  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ? AND role IS NULL').bind(role, user.id).run();
  const t = templates.welcome(c.env, appUrl(c.env, c.req.raw), user.name, role);
  await sendEmail(c.env, { to: user.email, ...t }, 'normal');
  return c.json({ ok: true, role });
});

me.patch('/locale', requireAuth, async (c) => {
  const { locale } = parse(localeSchema, await readJson(c.req.raw));
  await c.env.DB.prepare('UPDATE users SET locale = ? WHERE id = ?').bind(locale, c.get('user').id).run();
  return c.json({ ok: true });
});
