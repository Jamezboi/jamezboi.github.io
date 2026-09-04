-- AetherScan key + account store (Cloudflare D1 / SQLite)
-- One-time redemption is enforced atomically: a redeem is a single
--   UPDATE ... WHERE redeemed_at IS NULL
-- whose affected-row count decides success (two concurrent redeems →
-- exactly one wins).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- random id
  email         TEXT UNIQUE NOT NULL,
  username      TEXT,
  password_hash TEXT,                      -- pbkdf2$iterations$salt$hash (email accounts)
  google_sub    TEXT UNIQUE,               -- Google subject id (verified-by-Google)
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS licenses (
  key         TEXT PRIMARY KEY,            -- AETH-XXXX-XXXX-<TIER>-<ck>
  tier        TEXT NOT NULL,               -- pro | ultimate
  status      TEXT NOT NULL DEFAULT 'available',  -- available | redeemed | revoked
  issued_by   TEXT,
  issued_at   TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT,
  redeemed_by TEXT                         -- user id, or engine:<machine-id>
);

CREATE TABLE IF NOT EXISTS email_codes (
  email      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_redeemed_by ON licenses(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);