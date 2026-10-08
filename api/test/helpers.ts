// Test harness: a D1-compatible adapter over Node's built-in SQLite, an in-memory
// R2 stand-in, and helpers to sign in as a seeded user and call the Hono app.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { sign } from 'hono/jwt';
import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { resetRateLimits } from '../src/lib/ratelimit';

type Value = string | number | null | bigint | Uint8Array;

class Stmt {
  constructor(
    private db: DatabaseSync,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Stmt(this.db, this.sql, values.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : (v as Value))));
  }
  private prepared() {
    return this.db.prepare(this.sql);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.prepared().get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.prepared().all(...this.params) as T[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: { changes: 0 } };
  }
  async run() {
    const s = this.prepared();
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = s.all(...this.params);
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const r = s.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() {
    return (this.prepared().all(...this.params) as Record<string, unknown>[]).map((r) => Object.values(r));
  }
}

export class TestD1 {
  db = new DatabaseSync(':memory:');
  constructor() {
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) {
        out.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run());
      }
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
}

export class TestR2 {
  store = new Map<string, { body: Uint8Array; type?: string }>();
  async put(key: string, body: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
    this.store.set(key, { body, type: opts?.httpMetadata?.contentType });
    return {};
  }
  async get(key: string) {
    const o = this.store.get(key);
    if (!o) return null;
    return {
      body: o.body,
      httpEtag: '"etag"',
      writeHttpMetadata: (h: Headers) => {
        if (o.type) h.set('content-type', o.type);
      },
    };
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

export function migrate(d1: TestD1) {
  const dir = fileURLToPath(new URL('../../migrations', import.meta.url));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    d1.db.exec(readFileSync(join(dir, f), 'utf8'));
  }
}

export const JWT_SECRET = 'test-secret-test-secret-test-secret';

export function makeEnv(overrides: Partial<Env> = {}) {
  const d1 = new TestD1();
  migrate(d1);
  const env = {
    DB: d1 as unknown as D1Database,
    UPLOADS: new TestR2() as unknown as R2Bucket,
    JWT_SECRET,
    ADMIN_EMAILS: 'admin@test.in',
    PACKAGING_CAP: '15',
    EMAIL_DAILY_LIMIT: '100',
    APP_URL: 'http://localhost',
    GOOGLE_CLIENT_ID: 'test-client',
    ...overrides,
  } as Env;
  return { env, d1 };
}

export function makeClient(env: Env) {
  resetRateLimits();
  const app = createApp();
  async function request(path: string, init: RequestInit & { as?: string; json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (init.as) {
      const token = await sign({ sub: init.as, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET, 'HS256');
      headers.set('Cookie', `ss_session=${token}`);
    }
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.json);
    }
    const res = await app.request(`http://localhost${path}`, { ...init, headers, body }, env);
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, data, headers: res.headers };
  }
  return { request, app };
}

// ---------------------------------------------------------------------------
// Fixtures (Vadodara)
// ---------------------------------------------------------------------------
export const VADODARA = { lat: 22.3072, lng: 73.1812 };

export function seedUser(d1: TestD1, id: string, email: string, role: string | null, status = 'active') {
  d1.db.prepare('INSERT INTO users (id, email, name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, id, role, status, Date.now());
}

export function seedRestaurant(d1: TestD1, id: string, opts: { verification?: string; lat?: number; lng?: number; premium?: number } = {}) {
  seedUser(d1, id, `${id}@test.in`, 'restaurant');
  const t = Date.now();
  d1.db
    .prepare(
      `INSERT INTO restaurants (user_id, name, address, city, lat, lng, phone, fssai_number, verification, premium, created_at, updated_at)
       VALUES (?, ?, 'Alkapuri, Vadodara', 'vadodara', ?, ?, '9876543210', '12345678901234', ?, ?, ?, ?)`,
    )
    .run(id, `Restaurant ${id}`, opts.lat ?? VADODARA.lat, opts.lng ?? VADODARA.lng, opts.verification ?? 'approved', opts.premium ?? 0, t, t);
}

export function seedNgo(d1: TestD1, id: string, opts: { verification?: string; lat?: number; lng?: number; noShows?: number } = {}) {
  seedUser(d1, id, `${id}@test.in`, 'ngo');
  const t = Date.now();
  d1.db
    .prepare(
      `INSERT INTO ngos (user_id, name, address, city, lat, lng, phone, registration_number, verification, no_show_count, created_at, updated_at)
       VALUES (?, ?, 'Sayajigunj, Vadodara', 'vadodara', ?, ?, '9876500000', 'GUJ/123/2020', ?, ?, ?, ?)`,
    )
    .run(id, `NGO ${id}`, opts.lat ?? VADODARA.lat + 0.01, opts.lng ?? VADODARA.lng, opts.verification ?? 'approved', opts.noShows ?? 0, t, t);
}

export const fullChecklist = {
  cookedHygienically: true,
  storedSafely: true,
  notServed: true,
  labelledAllergens: true,
  packagedSealed: true,
};

export function listingBody(overrides: Record<string, unknown> = {}) {
  const t = Date.now();
  return {
    title: 'Veg biryani',
    description: 'Fresh from lunch service',
    servings: 40,
    foodType: 'veg',
    allergens: ['dairy'],
    cookedAt: t - 30 * 60_000,
    safeUntil: t + 5 * 3600_000,
    pickupStart: t,
    pickupEnd: t + 3 * 3600_000,
    packagingCost: 5,
    checklist: fullChecklist,
    ...overrides,
  };
}
