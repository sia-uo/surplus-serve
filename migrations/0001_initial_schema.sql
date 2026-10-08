-- SurplusServe initial schema.
-- All timestamps are integer milliseconds since the Unix epoch (UTC).
-- D1 enforces foreign keys by default.

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL DEFAULT '',
  avatar_url        TEXT,
  google_sub        TEXT UNIQUE,
  role              TEXT CHECK (role IN ('restaurant', 'ngo', 'admin')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  suspended_reason  TEXT,
  locale            TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi', 'gu')),
  created_at        INTEGER NOT NULL,
  last_login_at     INTEGER
);
CREATE INDEX idx_users_role_status ON users (role, status);
CREATE INDEX idx_users_created ON users (created_at);

CREATE TABLE restaurants (
  user_id           TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  city              TEXT NOT NULL,
  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  phone             TEXT NOT NULL,
  fssai_number      TEXT NOT NULL,
  upi_id            TEXT,
  hide_name         INTEGER NOT NULL DEFAULT 0,
  verification      TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  premium           INTEGER NOT NULL DEFAULT 0,
  rating_sum        INTEGER NOT NULL DEFAULT 0,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  meals_donated     INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_restaurants_verification ON restaurants (verification);
CREATE INDEX idx_restaurants_city ON restaurants (city);

CREATE TABLE ngos (
  user_id           TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  city              TEXT NOT NULL,
  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  phone             TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  certificate_key   TEXT,
  verification      TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  alerts_enabled    INTEGER NOT NULL DEFAULT 1,
  alert_radius_km   INTEGER NOT NULL DEFAULT 5,
  last_alert_at     INTEGER,
  completed_count   INTEGER NOT NULL DEFAULT 0,
  no_show_count     INTEGER NOT NULL DEFAULT 0,
  rating_sum        INTEGER NOT NULL DEFAULT 0,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  meals_received    INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_ngos_verification ON ngos (verification);
CREATE INDEX idx_ngos_city ON ngos (city);
CREATE INDEX idx_ngos_alerts_lat ON ngos (alerts_enabled, lat);

-- ---------------------------------------------------------------------------
-- Listings & claims
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_templates (
  id                TEXT PRIMARY KEY,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants (user_id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  servings          INTEGER NOT NULL,
  food_type         TEXT NOT NULL CHECK (food_type IN ('veg', 'nonveg', 'jain')),
  allergens         TEXT NOT NULL DEFAULT '[]',
  packaging_cost    INTEGER NOT NULL DEFAULT 0,
  frequency         TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  weekday           INTEGER CHECK (weekday BETWEEN 0 AND 6),
  post_time         TEXT NOT NULL,               -- HH:MM in IST
  safe_hours        INTEGER NOT NULL,            -- safe-until = post time + safe_hours
  pickup_start_offset_min INTEGER NOT NULL DEFAULT 0,
  pickup_duration_min     INTEGER NOT NULL DEFAULT 120,
  checklist         TEXT NOT NULL,               -- JSON of acknowledged checklist items
  active            INTEGER NOT NULL DEFAULT 1,
  last_run_date     TEXT,                        -- YYYY-MM-DD (IST) of last generated listing
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_recurring_active ON recurring_templates (active, post_time);
CREATE INDEX idx_recurring_restaurant ON recurring_templates (restaurant_id);

CREATE TABLE listings (
  id                TEXT PRIMARY KEY,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants (user_id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  servings_total    INTEGER NOT NULL CHECK (servings_total > 0),
  servings_remaining INTEGER NOT NULL CHECK (servings_remaining >= 0),
  food_type         TEXT NOT NULL CHECK (food_type IN ('veg', 'nonveg', 'jain')),
  allergens         TEXT NOT NULL DEFAULT '[]',
  cooked_at         INTEGER NOT NULL,
  safe_until        INTEGER NOT NULL,
  pickup_start      INTEGER NOT NULL,
  pickup_end        INTEGER NOT NULL,
  packaging_cost    INTEGER NOT NULL DEFAULT 0,  -- rupees per serving
  photo_key         TEXT,
  checklist         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'claimed', 'completed', 'expired', 'cancelled')),
  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  city              TEXT NOT NULL,
  recurring_id      TEXT REFERENCES recurring_templates (id) ON DELETE SET NULL,
  alerted           INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_listings_search ON listings (status, lat, lng);
CREATE INDEX idx_listings_status_safe ON listings (status, safe_until);
CREATE INDEX idx_listings_restaurant ON listings (restaurant_id, status, created_at);
CREATE INDEX idx_listings_alert ON listings (alerted, status);
CREATE INDEX idx_listings_city ON listings (city, created_at);

CREATE TABLE claims (
  id                TEXT PRIMARY KEY,
  listing_id        TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  ngo_id            TEXT NOT NULL REFERENCES ngos (user_id) ON DELETE CASCADE,
  restaurant_id     TEXT NOT NULL REFERENCES restaurants (user_id) ON DELETE CASCADE,
  servings          INTEGER NOT NULL CHECK (servings > 0),
  otp               TEXT NOT NULL,
  otp_attempts      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed', 'cancelled', 'no_show')),
  safety_ack        INTEGER NOT NULL DEFAULT 0,
  pickup_by         INTEGER NOT NULL,
  cancel_reason     TEXT,
  food_rating       INTEGER CHECK (food_rating BETWEEN 1 AND 5),
  food_comment      TEXT,
  ngo_rating        INTEGER CHECK (ngo_rating BETWEEN 1 AND 5),
  ngo_comment       TEXT,
  created_at        INTEGER NOT NULL,
  completed_at      INTEGER,
  cancelled_at      INTEGER
);
CREATE INDEX idx_claims_ngo ON claims (ngo_id, status, created_at);
CREATE INDEX idx_claims_restaurant ON claims (restaurant_id, status, created_at);
CREATE INDEX idx_claims_listing ON claims (listing_id, status);
CREATE INDEX idx_claims_pending_due ON claims (status, pickup_by);

-- ---------------------------------------------------------------------------
-- Immutable audit log of OTP-verified pickups (proof for sponsors).
-- Each row carries a SHA-256 hash chained to the previous row.
-- ---------------------------------------------------------------------------
CREATE TABLE pickup_audit (
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  id                TEXT NOT NULL UNIQUE,
  claim_id          TEXT NOT NULL UNIQUE,
  listing_id        TEXT NOT NULL,
  restaurant_id     TEXT NOT NULL,
  restaurant_name   TEXT NOT NULL,
  ngo_id            TEXT NOT NULL,
  ngo_name          TEXT NOT NULL,
  city              TEXT NOT NULL,
  food_title        TEXT NOT NULL,
  food_type         TEXT NOT NULL,
  servings          INTEGER NOT NULL,
  otp_verified      INTEGER NOT NULL DEFAULT 1,
  verified_by       TEXT NOT NULL,
  verified_at       INTEGER NOT NULL,
  prev_hash         TEXT NOT NULL,
  hash              TEXT NOT NULL
);
CREATE INDEX idx_audit_city_time ON pickup_audit (city, verified_at);
CREATE INDEX idx_audit_time ON pickup_audit (verified_at);
CREATE INDEX idx_audit_restaurant ON pickup_audit (restaurant_id, verified_at);

CREATE TRIGGER pickup_audit_no_update BEFORE UPDATE ON pickup_audit
BEGIN
  SELECT RAISE(ABORT, 'pickup_audit is append-only');
END;

CREATE TRIGGER pickup_audit_no_delete BEFORE DELETE ON pickup_audit
BEGIN
  SELECT RAISE(ABORT, 'pickup_audit is append-only');
END;

-- ---------------------------------------------------------------------------
-- Sponsors, messages, admin actions
-- ---------------------------------------------------------------------------
CREATE TABLE sponsors (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo_key          TEXT,
  website           TEXT,
  city              TEXT NOT NULL,             -- lowercase city, or 'all' for national
  tier              TEXT NOT NULL CHECK (tier IN ('platinum', 'gold', 'silver')),
  start_date        TEXT NOT NULL,             -- YYYY-MM-DD
  end_date          TEXT NOT NULL,             -- YYYY-MM-DD
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_sponsors_dates ON sponsors (start_date, end_date);
CREATE INDEX idx_sponsors_city ON sponsors (city);

CREATE TABLE contact_messages (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('sponsor', 'premium')),
  user_id           TEXT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  organisation      TEXT,
  city              TEXT,
  phone             TEXT,
  message           TEXT NOT NULL,
  handled           INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_contact_created ON contact_messages (kind, created_at);

CREATE TABLE admin_actions (
  id                TEXT PRIMARY KEY,
  admin_id          TEXT NOT NULL,
  action            TEXT NOT NULL,
  target_id         TEXT,
  detail            TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_admin_actions_created ON admin_actions (created_at);

-- ---------------------------------------------------------------------------
-- Infrastructure: geocode cache, email quota, small key/value state
-- ---------------------------------------------------------------------------
CREATE TABLE geocode_cache (
  query             TEXT PRIMARY KEY,          -- normalised lowercase query
  results           TEXT NOT NULL,             -- JSON array of {label, lat, lng, city}
  created_at        INTEGER NOT NULL
);

CREATE TABLE email_quota (
  day               TEXT PRIMARY KEY,          -- YYYY-MM-DD (UTC, matches Resend's reset)
  count             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_state (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  updated_at        INTEGER NOT NULL
);
