-- =====================================================================
-- RESET: drops every table so this file can be pasted into the Supabase SQL
-- editor and rebuild the schema from scratch. THIS DELETES ALL DATA.
-- Children first, so foreign keys don't block the drops.
-- =====================================================================
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS task_events;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS email_verification_tokens;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS newsletter_subscribers;
DROP TABLE IF EXISTS users;

-- Registered users. tasks.created_by_id is a foreign key to this table.
-- email_verified_at is NULL until the owner proves they control the address (see
-- email_verification_tokens below). Reads and login work either way; lib/auth
-- requireVerifiedEmail() is what gates task-mutating endpoints on it.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NULL,
  email_verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password reset links. Only the token hash is stored (lib/auth/resetToken.ts).
-- One row per link: `used_at` makes it single-use, `expires_at` limits its lifetime.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);

-- Email verification links. Same shape as password_reset_tokens, and the same reason:
-- only the hash is stored, single-use via used_at, time-limited via expires_at. Longer
-- TTL than a password reset (24h, not 1h) since getting locked out of verifying is a
-- bigger annoyance than a missed reset link, which can just be requested again.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  parent_id TEXT NULL REFERENCES tasks (id),

  title VARCHAR(255) NOT NULL,
  description TEXT NULL,

  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'inProgress', 'done')),

  visible BOOLEAN NOT NULL DEFAULT TRUE,

  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  created_by_id TEXT NOT NULL REFERENCES users (id),
  created_by_name TEXT NULL,

  version BIGINT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  deleted_at TIMESTAMPTZ NULL,

  CHECK (end_time >= start_time)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks (created_by_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_start_time ON tasks (start_time);
CREATE INDEX IF NOT EXISTS idx_tasks_end_time ON tasks (end_time);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks (updated_at);

-- Sets `updated_at` on every row change (Postgres has no ON UPDATE CURRENT_TIMESTAMP).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_set_updated_at ON tasks;
CREATE TRIGGER trg_tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Change/audit log for tasks. Every create/update/delete (single and bulk) writes a
-- row here in the same transaction as the task change; GET /api/sync reads it.
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,

  task_id TEXT NOT NULL,
  actor_id TEXT NULL,

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events (task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events (created_at);

-- Retry cache. The response is stored once per (user, key) and replayed on retries.
-- Scoped per user, so nobody can read another user's stored response.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT,
  task_id TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- Newsletter signups. Independent of `users`: subscribing needs no account, and an
-- account needs no subscription. Only the unsubscribe token's hash is stored, the same
-- pattern as password_reset_tokens, so a database leak doesn't hand out working
-- unsubscribe links.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  unsubscribe_token_hash TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_unsubscribed_at ON newsletter_subscribers (unsubscribed_at);

-- Shared counters for the rate limiter (lib/rateLimit.ts). One row per (key, window).
-- `key` is e.g. "login:<hash of email>|<ip>"; old windows are deleted opportunistically.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start);
