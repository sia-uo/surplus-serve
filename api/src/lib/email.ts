import type { Env } from '../env';
import { adminEmails, escapeHtml, utcDay } from './util';

/**
 * Email via Resend's HTTP API with a D1-backed daily quota.
 *
 * Priorities decide how close to the daily limit a message may be sent:
 *  - critical: claim OTPs, approvals, no-show warnings — up to the full limit
 *  - normal:   welcome, pickup completed, admin notifications — stop 10 before
 *  - bulk:     new-listing alerts — stop 30 before the limit
 */
export type EmailPriority = 'critical' | 'normal' | 'bulk';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export function dailyLimit(env: Env): number {
  const n = Number(env.EMAIL_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function ceilingFor(priority: EmailPriority, limit: number): number {
  if (priority === 'critical') return limit;
  if (priority === 'normal') return Math.max(0, limit - 10);
  return Math.max(0, limit - 30);
}

/** Atomically reserves `n` sends from today's quota; returns how many were granted. */
export async function reserveQuota(env: Env, n: number, priority: EmailPriority, nowMs = Date.now()): Promise<number> {
  if (n <= 0) return 0;
  const day = utcDay(nowMs);
  const ceiling = ceilingFor(priority, dailyLimit(env));
  const row = await env.DB.prepare('SELECT count FROM email_quota WHERE day = ?').bind(day).first<{ count: number }>();
  const used = row?.count ?? 0;
  const grant = Math.max(0, Math.min(n, ceiling - used));
  if (grant === 0) return 0;
  const res = await env.DB.prepare(
    `INSERT INTO email_quota (day, count) VALUES (?1, ?2)
     ON CONFLICT(day) DO UPDATE SET count = count + ?2 WHERE count + ?2 <= ?3`,
  )
    .bind(day, grant, ceiling)
    .run();
  return res.meta.changes > 0 ? grant : 0;
}

export async function remainingQuota(env: Env, priority: EmailPriority, nowMs = Date.now()): Promise<number> {
  const row = await env.DB.prepare('SELECT count FROM email_quota WHERE day = ?')
    .bind(utcDay(nowMs))
    .first<{ count: number }>();
  return Math.max(0, ceilingFor(priority, dailyLimit(env)) - (row?.count ?? 0));
}

async function postResend(env: Env, path: string, body: unknown): Promise<boolean> {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('Resend error', res.status, await res.text().catch(() => ''));
  return res.ok;
}

const from = (env: Env) => env.EMAIL_FROM || 'SurplusServe <onboarding@resend.dev>';

/** Send one email if quota allows. Never throws — email must not break the main flow. */
export async function sendEmail(env: Env, msg: EmailMessage, priority: EmailPriority = 'normal'): Promise<boolean> {
  try {
    if (!env.RESEND_API_KEY) {
      console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"`);
      return false;
    }
    if ((await reserveQuota(env, 1, priority)) < 1) {
      console.warn('Email skipped: daily quota reached', msg.subject);
      return false;
    }
    return await postResend(env, '/emails', { from: from(env), to: [msg.to], subject: msg.subject, html: msg.html });
  } catch (err) {
    console.error('sendEmail failed', err);
    return false;
  }
}

/** Send many emails using Resend's batch endpoint (max 100 per call). Returns the number sent. */
export async function sendBatch(env: Env, msgs: EmailMessage[], priority: EmailPriority = 'bulk'): Promise<number> {
  try {
    if (msgs.length === 0) return 0;
    if (!env.RESEND_API_KEY) {
      for (const m of msgs) console.log(`[email:dev] to=${m.to} subject="${m.subject}"`);
      return 0;
    }
    const granted = await reserveQuota(env, Math.min(msgs.length, 100), priority);
    if (granted === 0) return 0;
    const batch = msgs.slice(0, granted).map((m) => ({ from: from(env), to: [m.to], subject: m.subject, html: m.html }));
    return (await postResend(env, '/emails/batch', batch)) ? batch.length : 0;
  } catch (err) {
    console.error('sendBatch failed', err);
    return 0;
  }
}

export async function emailAdmins(env: Env, subject: string, html: string) {
  for (const to of adminEmails(env).slice(0, 3)) await sendEmail(env, { to, subject, html }, 'normal');
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function layout(env: Env, baseUrl: string, title: string, body: string): string {
  const app = escapeHtml(env.APP_NAME || 'SurplusServe');
  return `<!doctype html><html><body style="margin:0;background:#F8F5EC;font-family:Inter,Arial,sans-serif;color:#0B1F3A">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F5EC;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #C9A227;border-radius:14px;overflow:hidden">
<tr><td style="background:#0B1F3A;padding:20px 28px;border-bottom:3px solid #C9A227">
<span style="font-family:Georgia,serif;font-size:22px;color:#C9A227;font-weight:bold;letter-spacing:.5px">${app}</span></td></tr>
<tr><td style="padding:28px">
<h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 16px;color:#0B1F3A">${escapeHtml(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px;background:#F8F5EC;font-size:12px;color:#555">
${app} only connects restaurants and NGOs. Food is shared free of charge; NGOs pay only the stated packaging cost directly to the restaurant at pickup.
<br><a href="${baseUrl}" style="color:#B3121F">${escapeHtml(baseUrl.replace(/^https?:\/\//, ''))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${s}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#B3121F;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p>`;

export const templates = {
  welcome(env: Env, base: string, name: string, role: 'restaurant' | 'ngo') {
    const next =
      role === 'restaurant'
        ? 'Once our team approves your FSSAI details you can start posting surplus food.'
        : 'Upload your registration certificate — once approved you can claim food near you.';
    return {
      subject: 'Welcome to SurplusServe',
      html: layout(env, base, `Welcome, ${name}`, p('Thank you for joining SurplusServe — together we keep good food out of the bin.') + p(next) + button(`${base}/dashboard`, 'Open dashboard')),
    };
  },
  verification(env: Env, base: string, name: string, approved: boolean, reason?: string | null) {
    return approved
      ? {
          subject: 'Your SurplusServe account is approved',
          html: layout(env, base, 'You are approved', p(`Great news, ${escapeHtml(name)} — your account has been verified.`) + button(`${base}/dashboard`, 'Get started')),
        }
      : {
          subject: 'Your SurplusServe verification needs attention',
          html: layout(env, base, 'Verification not approved', p(`Hi ${escapeHtml(name)}, we could not verify your details.`) + (reason ? p(`<strong>Reason:</strong> ${escapeHtml(reason)}`) : '') + p('Please update your profile and we will review it again.') + button(`${base}/dashboard`, 'Update profile')),
        };
  },
  claimConfirmation(env: Env, base: string, d: { ngoName: string; title: string; servings: number; otp: string; restaurantName: string; address: string; phone: string; pickupBy: string; packagingTotal: number; directions: string }) {
    return {
      subject: `Pickup OTP ${d.otp} — ${d.title}`,
      html: layout(
        env,
        base,
        'Your claim is confirmed',
        p(`Hi ${escapeHtml(d.ngoName)}, you claimed <strong>${d.servings} servings</strong> of <strong>${escapeHtml(d.title)}</strong>.`) +
          `<p style="font-size:30px;letter-spacing:8px;font-weight:bold;color:#B3121F;margin:16px 0;font-family:monospace">${d.otp}</p>` +
          p('Show this OTP to the restaurant at pickup.') +
          p(`<strong>${escapeHtml(d.restaurantName)}</strong><br>${escapeHtml(d.address)}<br>Phone: ${escapeHtml(d.phone)}`) +
          p(`Collect by: <strong>${escapeHtml(d.pickupBy)}</strong> (IST)`) +
          p(`Packaging cost to pay the restaurant at pickup (UPI/cash): <strong>₹${d.packagingTotal}</strong>`) +
          button(d.directions, 'Get directions'),
      ),
    };
  },
  pickupCompleted(env: Env, base: string, d: { name: string; title: string; servings: number; counterparty: string }) {
    return {
      subject: `Pickup completed — ${d.servings} meals shared`,
      html: layout(env, base, 'Pickup completed', p(`Hi ${escapeHtml(d.name)}, the pickup of <strong>${d.servings} servings</strong> of <strong>${escapeHtml(d.title)}</strong> with ${escapeHtml(d.counterparty)} was OTP-verified. Thank you!`) + p('Please take a moment to leave a rating.') + button(`${base}/dashboard`, 'Rate this pickup')),
    };
  },
  noShowWarning(env: Env, base: string, d: { name: string; title: string; count: number; suspended: boolean }) {
    return {
      subject: d.suspended ? 'Your SurplusServe account has been suspended' : 'Missed pickup recorded',
      html: layout(
        env,
        base,
        d.suspended ? 'Account suspended' : 'Missed pickup',
        p(`Hi ${escapeHtml(d.name)}, your claim for <strong>${escapeHtml(d.title)}</strong> was not collected in the pickup window and has been recorded as a no-show (${d.count} so far).`) +
          (d.suspended
            ? p('Because of 3 no-shows your account is suspended. Please contact the SurplusServe team to appeal.')
            : p('Please cancel claims you cannot collect so the food can reach someone else. 3 no-shows lead to automatic suspension.')),
      ),
    };
  },
  newListings(env: Env, base: string, d: { name: string; listings: { title: string; servings: number; distance: string; safeUntil: string; urgent: boolean }[] }) {
    const rows = d.listings
      .map(
        (l) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #eee"><strong>${escapeHtml(l.title)}</strong>${l.urgent ? ' <span style="background:#B3121F;color:#fff;border-radius:6px;padding:1px 6px;font-size:11px">URGENT</span>' : ''}<br><span style="font-size:13px;color:#555">${l.servings} servings · ${escapeHtml(l.distance)} away · safe until ${escapeHtml(l.safeUntil)}</span></td></tr>`,
      )
      .join('');
    return {
      subject: `${d.listings.length} new food listing${d.listings.length > 1 ? 's' : ''} near you`,
      html: layout(env, base, 'New food near you', p(`Hi ${escapeHtml(d.name)}, new surplus food was posted within your alert radius:`) + `<table width="100%">${rows}</table>` + button(`${base}/ngo`, 'View and claim')),
    };
  },
  adminNotice(env: Env, base: string, title: string, fields: Record<string, string | null | undefined>) {
    const rows = Object.entries(fields)
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`)
      .join('');
    return { subject: `[SurplusServe] ${title}`, html: layout(env, base, title, `<table>${rows}</table>`) };
  },
};
