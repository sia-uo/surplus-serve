import type { Env } from '../env';
import { newId, sha256Hex } from './util';

export interface AuditEntry {
  claimId: string;
  listingId: string;
  restaurantId: string;
  restaurantName: string;
  ngoId: string;
  ngoName: string;
  city: string;
  foodTitle: string;
  foodType: string;
  servings: number;
  verifiedBy: string;
  verifiedAt: number;
}

export function auditPayload(e: AuditEntry, prevHash: string): string {
  return [
    prevHash,
    e.claimId,
    e.listingId,
    e.restaurantId,
    e.ngoId,
    e.city,
    e.servings,
    e.verifiedBy,
    e.verifiedAt,
  ].join('|');
}

/**
 * Builds the INSERT for an append-only, hash-chained audit row. Returned as a
 * prepared statement so the caller can include it in a D1 batch (transaction).
 */
export async function auditInsert(env: Env, e: AuditEntry): Promise<D1PreparedStatement> {
  const prev = await env.DB.prepare('SELECT hash FROM pickup_audit ORDER BY seq DESC LIMIT 1').first<{ hash: string }>();
  const prevHash = prev?.hash ?? 'GENESIS';
  const hash = await sha256Hex(auditPayload(e, prevHash));
  return env.DB.prepare(
    `INSERT INTO pickup_audit (id, claim_id, listing_id, restaurant_id, restaurant_name, ngo_id, ngo_name, city,
       food_title, food_type, servings, otp_verified, verified_by, verified_at, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  ).bind(
    newId(),
    e.claimId,
    e.listingId,
    e.restaurantId,
    e.restaurantName,
    e.ngoId,
    e.ngoName,
    e.city,
    e.foodTitle,
    e.foodType,
    e.servings,
    e.verifiedBy,
    e.verifiedAt,
    prevHash,
    hash,
  );
}

interface AuditRow {
  claim_id: string;
  listing_id: string;
  restaurant_id: string;
  ngo_id: string;
  city: string;
  servings: number;
  verified_by: string;
  verified_at: number;
  prev_hash: string;
  hash: string;
}

/** Verifies the hash chain over rows ordered by seq ascending. Returns the index of the first broken row or -1. */
export async function verifyChain(rows: AuditRow[]): Promise<number> {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i > 0 && r.prev_hash !== rows[i - 1].hash) return i;
    const expected = await sha256Hex(
      auditPayload(
        {
          claimId: r.claim_id,
          listingId: r.listing_id,
          restaurantId: r.restaurant_id,
          ngoId: r.ngo_id,
          city: r.city,
          servings: r.servings,
          verifiedBy: r.verified_by,
          verifiedAt: r.verified_at,
        } as AuditEntry,
        r.prev_hash,
      ),
    );
    if (expected !== r.hash) return i;
  }
  return -1;
}
