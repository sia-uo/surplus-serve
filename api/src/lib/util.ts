import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import { DEFAULT_PACKAGING_CAP } from '../../../shared/constants';
import type { Env } from '../env';

export const now = () => Date.now();

export function newId(): string {
  return crypto.randomUUID();
}

/** Cryptographically random 6-digit OTP (uniform, no modulo bias). */
export function generateOtp(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function fail(status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.join('.') || 'input';
    fail(400, `Invalid ${path}: ${issue?.message ?? 'bad request'}`);
  }
  return result.data;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    fail(400, 'Expected a JSON body');
  }
}

export function packagingCap(env: Env): number {
  const n = Number(env.PACKAGING_CAP);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PACKAGING_CAP;
}

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function appUrl(env: Env, req?: Request): string {
  if (req) return new URL(req.url).origin;
  return (env.APP_URL ?? '').replace(/\/$/, '');
}

export const PAGE_SIZE = 20;

export function pageParams(q: Record<string, string | undefined>, max = 50) {
  const page = Math.max(1, Math.min(1000, Number.parseInt(q.page ?? '1', 10) || 1));
  const pageSize = Math.max(1, Math.min(max, Number.parseInt(q.pageSize ?? String(PAGE_SIZE), 10) || PAGE_SIZE));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Fetch pageSize+1 rows and use the extra one to determine hasMore. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  return { items: rows.slice(0, pageSize), page, pageSize, hasMore: rows.length > pageSize };
}

export function normaliseCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Date string YYYY-MM-DD for a timestamp, in UTC. */
export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** IST is a fixed UTC+05:30 offset (no DST). */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istParts(ts: number) {
  const d = new Date(ts + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** Epoch ms for an IST calendar date (YYYY-MM-DD) at HH:MM. */
export function istToEpoch(date: string, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.parse(`${date}T00:00:00Z`) + (h * 60 + m) * 60_000 - IST_OFFSET_MS;
}

export async function logAdminAction(env: Env, adminId: string, action: string, targetId: string | null, detail?: string) {
  await env.DB.prepare(
    'INSERT INTO admin_actions (id, admin_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId(), adminId, action, targetId, detail ?? null, now())
    .run();
}
