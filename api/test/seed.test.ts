import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeClient, makeEnv } from './helpers';

const seedSql = readFileSync(fileURLToPath(new URL('../../scripts/seed.sql', import.meta.url)), 'utf8');

describe('demo seed script', () => {
  it('loads 5 restaurants, 3 NGOs and 10 searchable listings around Vadodara, and is re-runnable', async () => {
    const { env, d1 } = makeEnv();
    d1.db.exec(seedSql);
    d1.db.exec(seedSql);
    const count = (sql: string) => (d1.db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT COUNT(*) AS n FROM restaurants')).toBe(5);
    expect(count('SELECT COUNT(*) AS n FROM ngos')).toBe(3);
    expect(count("SELECT COUNT(*) AS n FROM listings WHERE status = 'active'")).toBe(10);
    expect(count('SELECT COUNT(*) AS n FROM listings WHERE pickup_end > safe_until')).toBe(0);

    const { request } = makeClient(env);
    const res = await request('/api/listings/search?lat=22.3072&lng=73.1812&radius=10', { as: 'demo-n-1' });
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(10);
    expect(res.data.items.some((l: { urgent: boolean }) => l.urgent)).toBe(true);
  });
});
