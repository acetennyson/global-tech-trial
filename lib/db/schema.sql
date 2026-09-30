-- TM-2: registered users. Kept as its own table rather than folded into the
-- fake-auth header world tasks already reference (created_by_id is TEXT, not a
-- FK, precisely so M1's schema didn't have to know about auth yet).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Forgot-password flow. Only the token's hash is stored (see lib/auth/resetToken.ts,
-- same reasoning as never storing a plaintext password). One row per issued link;
-- `used_at` makes a link single-use, `expires_at` bounds how long it's live.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);

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

  created_by_id TEXT NOT NULL,
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

-- Auto-bump `updated_at` on every row change, same as MySQL's
-- "ON UPDATE CURRENT_TIMESTAMP" used to. Postgres has no built-in equivalent.
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

-- Dedupe retried writes. A response is stored once per (user, key) and replayed
-- verbatim on every retry with the same key by the same user. Keys are scoped per
-- user so one user can never read back another user's stored response.
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

-- Upgrade path for databases created before keys were per-user (global PK on key).
-- Rows are a retry cache, so anything that can't be attributed to a user is dropped.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'idempotency_keys' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE idempotency_keys ADD COLUMN user_id TEXT;
    UPDATE idempotency_keys k SET user_id = t.created_by_id
      FROM tasks t WHERE t.id = k.task_id;
    DELETE FROM idempotency_keys WHERE user_id IS NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_pkey;
    ALTER TABLE idempotency_keys ADD PRIMARY KEY (user_id, key);
  END IF;
END $$;

-- Binds a key to the request it was first used with (sha256 of the canonical input),
-- so reusing the key with a different body is rejected. NULL on rows written before
-- this existed; those are accepted as a match.
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash TEXT;
