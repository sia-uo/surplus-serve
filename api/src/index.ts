import { createApp } from './app';
import { scheduled } from './cron';
import type { Env } from './env';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduled(controller, env));
  },
} satisfies ExportedHandler<Env>;
