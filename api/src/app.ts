import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { admin } from './routes/admin';
import { auth } from './routes/auth';
import { files } from './routes/files';
import { listings } from './routes/listings';
import { me } from './routes/me';
import { ngo } from './routes/ngo';
import { pub } from './routes/public';
import { restaurant } from './routes/restaurant';

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use('/api/*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));

  // Same-origin app: reject cross-site state-changing requests (CSRF defence in depth on top of SameSite=Lax).
  app.use('/api/*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && origin !== new URL(c.req.url).origin) {
        throw new HTTPException(403, { message: 'Cross-origin request blocked' });
      }
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/auth', auth);
  app.route('/api/me', me);
  app.route('/api/restaurant', restaurant);
  app.route('/api/ngo', ngo);
  app.route('/api/listings', listings);
  app.route('/api/admin', admin);
  app.route('/api', files);
  app.route('/api', pub);

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  // Non-API paths are normally served by Workers Static Assets before the Worker runs.
  app.all('*', async (c) => {
    if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
    return c.text('Not found', 404);
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error('Unhandled error', err);
    return c.json({ error: 'Something went wrong. Please try again.' }, 500);
  });

  return app;
}
