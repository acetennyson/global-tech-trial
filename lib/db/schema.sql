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

-- Change/audit log for tasks. Table only at this stage — writing to it
-- transactionally alongside task mutations, and consuming it for sync/realtime,
-- is Module 2 / Module 4 / Module 5's work.
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

-- Dedupe retried POST /api/tasks requests. A response is stored once per key and
-- replayed verbatim on every retry with the same key, instead of creating a
-- second task.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
