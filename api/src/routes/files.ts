import { Hono } from 'hono';
import { UPLOAD_LIMITS, type UploadKind } from '../../../shared/constants';
import type { AppEnv } from '../env';
import { rateLimit } from '../lib/ratelimit';
import { loadSessionUser, requireAuth } from '../lib/session';
import { isPublicKey, KEY_PREFIX, publicFileUrl, validateUpload } from '../lib/uploads';
import { fail, newId } from '../lib/util';

export const files = new Hono<AppEnv>();

/** POST /api/uploads?kind=photo|cert|logo — multipart field "file". */
files.post('/uploads', requireAuth, rateLimit('upload', 20, 600_000), async (c) => {
  const user = c.get('user');
  const kind = c.req.query('kind') as UploadKind;
  if (!(kind in UPLOAD_LIMITS)) fail(400, 'Unknown upload kind');
  if (kind === 'photo' && user.role !== 'restaurant') fail(403, 'Only restaurants can upload food photos');
  if (kind === 'cert' && user.role !== 'ngo') fail(403, 'Only NGOs can upload certificates');
  if (kind === 'logo' && user.role !== 'admin') fail(403, 'Only admins can upload sponsor logos');

  const len = Number(c.req.header('content-length') ?? 0);
  if (len > UPLOAD_LIMITS[kind].maxBytes + 64 * 1024) fail(413, 'File is too large');

  let file: File | null = null;
  try {
    const form = await c.req.formData();
    const f = form.get('file');
    file = f && typeof f !== 'string' ? (f as File) : null;
  } catch {
    fail(400, 'Expected multipart form data');
  }
  if (!file) fail(400, 'No file provided');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateUpload(kind, bytes);
  if (typeof check === 'string') fail(415, check);

  const owner = kind === 'logo' ? 'sponsors' : user.id;
  const key = `${KEY_PREFIX[kind]}/${owner}/${newId()}.${check.ext}`;
  await c.env.UPLOADS.put(key, bytes, {
    httpMetadata: { contentType: check.type },
    customMetadata: { uploadedBy: user.id },
  });
  return c.json({ key, url: publicFileUrl(key) }, 201);
});

/** GET /api/files/<key> — photos/logos are public; certificates only for the owner and admins. */
files.get('/files/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ''));
  if (!/^(photos|certs|logos)\/[\w-]+\/[\w-]+\.(jpg|png|webp|pdf)$/.test(key)) fail(404, 'Not found');
  if (!isPublicKey(key)) {
    const user = await loadSessionUser(c);
    const owner = key.split('/')[1];
    if (!user || (user.role !== 'admin' && user.id !== owner)) fail(404, 'Not found');
  }
  const obj = await c.env.UPLOADS.get(key);
  if (!obj) fail(404, 'Not found');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  headers.set('Cache-Control', isPublicKey(key) ? 'public, max-age=31536000, immutable' : 'private, no-store');
  if (key.endsWith('.pdf')) headers.set('Content-Disposition', 'inline');
  return new Response(obj.body, { headers });
});
