-- SurplusServe demo data: 5 restaurants, 3 NGOs and 10 listings around Vadodara, Gujarat.
-- NOT a migration — never runs automatically. Run manually:
--   local:  npm run db:seed:local
--   remote: npm run db:seed:remote   (only for a demo/staging database!)
-- Safe to re-run: it removes previous demo accounts (cascading to their data) first.
-- Listing times are relative to "now", so re-running refreshes them.
-- Sign in locally as any demo account via the dev login (DEV_LOGIN=true), e.g. spice.garden@demo.surplusserve.in

DELETE FROM users WHERE email LIKE '%@demo.surplusserve.in';

-- ---------------------------------------------------------------- users
INSERT INTO users (id, email, name, role, status, locale, created_at) VALUES
  ('demo-r-1', 'spice.garden@demo.surplusserve.in',   'Spice Garden',            'restaurant', 'active', 'en', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-2', 'royal.thali@demo.surplusserve.in',    'Royal Thali House',       'restaurant', 'active', 'gu', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-3', 'annapurna.jain@demo.surplusserve.in', 'Annapurna Jain Bhojnalay','restaurant', 'active', 'gu', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-4', 'tandoor.junction@demo.surplusserve.in','Tandoor Junction',       'restaurant', 'active', 'hi', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-5', 'green.leaf@demo.surplusserve.in',     'Green Leaf Café',         'restaurant', 'active', 'en', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-n-1', 'seva.annadan@demo.surplusserve.in',   'Seva Annadan Trust',      'ngo',        'active', 'gu', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-n-2', 'roti.bank@demo.surplusserve.in',      'Roti Bank Vadodara',      'ngo',        'active', 'hi', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-n-3', 'hope.foundation@demo.surplusserve.in','Hope Foundation',         'ngo',        'active', 'en', CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ---------------------------------------------------------- restaurants
INSERT INTO restaurants (user_id, name, address, city, lat, lng, phone, fssai_number, upi_id, hide_name, verification, premium, rating_sum, rating_count, created_at, updated_at) VALUES
  ('demo-r-1', 'Spice Garden',             'Race Course Road, Alkapuri, Vadodara 390007',     'vadodara', 22.3105, 73.1700, '+91 98250 10001', '10719026000101', 'spicegarden@upi', 0, 'approved', 0, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-2', 'Royal Thali House',        'University Road, Sayajigunj, Vadodara 390005',    'vadodara', 22.3180, 73.1890, '+91 98250 10002', '10719026000102', 'royalthali@upi',  0, 'approved', 1, 18, 4,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-3', 'Annapurna Jain Bhojnalay', 'Karelibaug Main Road, Vadodara 390018',           'vadodara', 22.3260, 73.2050, '+91 98250 10003', '10719026000103', NULL,              1, 'approved', 0, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-4', 'Tandoor Junction',         'Akota Stadium Road, Akota, Vadodara 390020',      'vadodara', 22.2960, 73.1680, '+91 98250 10004', '10719026000104', 'tandoorjn@upi',   0, 'approved', 0, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-r-5', 'Green Leaf Café',          'Gotri Road, near Sunrise Park, Vadodara 390021',  'vadodara', 22.3160, 73.1360, '+91 98250 10005', '10719026000105', 'greenleaf@upi',   0, 'approved', 0, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ----------------------------------------------------------------- NGOs
INSERT INTO ngos (user_id, name, address, city, lat, lng, phone, registration_number, verification, alerts_enabled, alert_radius_km, completed_count, no_show_count, created_at, updated_at) VALUES
  ('demo-n-1', 'Seva Annadan Trust', 'Fatehgunj Main Road, Vadodara 390002', 'vadodara', 22.3270, 73.1870, '+91 98980 20001', 'GUJ/VAD/F-1234/2015', 'approved', 1, 10, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-n-2', 'Roti Bank Vadodara', 'Manjalpur, Vadodara 390011',           'vadodara', 22.2730, 73.1960, '+91 98980 20002', 'U85300GJ2018NPL101234', 'approved', 1, 5, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('demo-n-3', 'Hope Foundation',    'Nizampura, Vadodara 390024',           'vadodara', 22.3410, 73.1820, '+91 98980 20003', 'E/5678/VADODARA',       'pending',  1, 5, 0, 0,
     CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);


-- ------------------------------------------------------------- listings
-- Offsets are minutes from now; every pickup window ends before safe-until.
-- (A VALUES CTE is used because D1 limits UNION ALL chains.)
WITH t(n) AS (SELECT CAST(strftime('%s','now') AS INTEGER) * 1000),
d(id, rid, title, descr, servings, food_type, allergens, cooked, safe, p_start, p_end, cost, lat, lng) AS (VALUES
  ('demo-l-01', 'demo-r-1', 'Veg pulao with dal tadka', 'Lunch buffet surplus, medium spice. Bring containers if possible.', 40, 'veg', '["dairy"]', -60, 240, 0, 150, 5, 22.3105, 73.1700),
  ('demo-l-02', 'demo-r-1', 'Paneer butter masala & rotis', '2 rotis per serving.', 25, 'veg', '["dairy","gluten"]', -45, 90, 0, 75, 8, 22.3105, 73.1700),
  ('demo-l-03', 'demo-r-2', 'Gujarati thali (dal, bhaat, shaak, rotli)', 'Full thalis packed in sealed boxes.', 60, 'veg', '["gluten","dairy"]', -30, 300, 15, 210, 10, 22.3180, 73.1890),
  ('demo-l-04', 'demo-r-2', 'Kadhi khichdi', 'Mild, suitable for children and elders.', 35, 'veg', '["dairy"]', -20, 360, 30, 240, 0, 22.3180, 73.1890),
  ('demo-l-05', 'demo-r-3', 'Jain sabzi with phulka', 'No onion, garlic or root vegetables.', 30, 'jain', '["gluten"]', -40, 200, 0, 180, 6, 22.3260, 73.2050),
  ('demo-l-06', 'demo-r-3', 'Jain dal dhokli', 'Freshly made for evening service.', 20, 'jain', '["gluten","peanuts"]', -15, 105, 0, 100, 5, 22.3260, 73.2050),
  ('demo-l-07', 'demo-r-4', 'Chicken biryani', 'Includes raita in separate pouches.', 45, 'nonveg', '["dairy"]', -50, 220, 0, 180, 12, 22.2960, 73.1680),
  ('demo-l-08', 'demo-r-4', 'Egg curry with jeera rice', '', 18, 'nonveg', '["egg"]', -25, 80, 0, 70, 10, 22.2960, 73.1680),
  ('demo-l-09', 'demo-r-5', 'Veg sandwiches & fruit cups', 'Cafe surplus, chilled.', 50, 'veg', '["gluten","dairy","sesame"]', -10, 420, 60, 360, 4, 22.3160, 73.1360),
  ('demo-l-10', 'demo-r-5', 'Masala oats upma', 'Nut-free.', 15, 'veg', '["mustard"]', -35, 180, 0, 160, 0, 22.3160, 73.1360)
)
INSERT INTO listings (id, restaurant_id, title, description, servings_total, servings_remaining, food_type, allergens,
  cooked_at, safe_until, pickup_start, pickup_end, packaging_cost, checklist, status, lat, lng, city, alerted, created_at, updated_at)
SELECT id, rid, title, descr, servings, servings, food_type, allergens,
  n + cooked * 60000, n + safe * 60000, n + p_start * 60000, n + p_end * 60000, cost,
  '{"cookedHygienically":true,"storedSafely":true,"notServed":true,"labelledAllergens":true,"packagedSealed":true,"seed":true}',
  'active', lat, lng, 'vadodara', 1, n, n
FROM t, d;