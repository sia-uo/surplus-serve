import type { Role } from '../../shared/types';

export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ASSETS?: Fetcher;

  // vars
  APP_NAME?: string;
  APP_URL?: string;
  PACKAGING_CAP?: string;
  EMAIL_FROM?: string;
  EMAIL_DAILY_LIMIT?: string;
  CONTACT_EMAIL?: string;
  DEV_LOGIN?: string;

  // secrets
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  JWT_SECRET?: string;
  ADMIN_EMAILS?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role | null;
  status: 'active' | 'suspended';
  suspended_reason: string | null;
  avatar_url: string | null;
  locale: 'en' | 'hi' | 'gu';
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: SessionUser;
  };
};
