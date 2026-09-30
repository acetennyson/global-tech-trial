# Global Tech Task Manager

A Task Manager REST API on Next.js App Router route handlers, backed by Supabase Postgres, with a sync protocol for offline-originated changes.

## Architecture

Three layers, each only aware of the one below it, so any can be swapped alone. Mirrors the `advanceSQL.php` toolkit this was ported from.

| Layer         | File                                               | Responsibility                                                                                                                                                                            |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query builder | [lib/db/queryBuilder.ts](lib/db/queryBuilder.ts)   | `Condition` in, `{ sql, params }` out. No I/O, cheap to unit test. DB-agnostic, emits `?` placeholders. |
| Execution     | [lib/db/advanceSQL.ts](lib/db/advanceSQL.ts)       | Runs those queries via a shared `pg` pool ([lib/db/pool.ts](lib/db/pool.ts)) against Supabase Postgres. Table-agnostic: `advanceSelect`, `advanceInsert`, `advanceUpdate`, `advanceDelete`, `advanceDeleteAll`. Converts `?` to Postgres's `$1, $2, ...` right before the query goes out. |
| Repository    | [lib/tasks/repository.ts](lib/tasks/repository.ts) | The only file that knows about `tasks` specifically: row/API mapping, filters to `Condition`, transactional writes (task and `task_events` together), optimistic concurrency, tombstones, idempotency. |

Every query is parameterized. Table and column names go through an allow-list check (`assertSafeIdentifier`) instead, since those can't be parameterized.

[lib/validation/task.ts](lib/validation/task.ts) (Zod schemas), [lib/auth.ts](lib/auth.ts) (who's calling, plus `ForbiddenError`), and [lib/http.ts](lib/http.ts) (response envelope) are separate, same reason.

On top of that, [lib/sync/](lib/sync): a push/pull sync protocol for clients that made changes while offline, built on `task_events`.

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with a Supabase Postgres connection string:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DB_CONNECTION_LIMIT=10
```

Use the pooler connection string (Supabase dashboard, Project Settings, Database, Connection pooling), not the direct `db.<ref>.supabase.co` one. The direct host is IPv6-only and won't resolve on most networks.

Apply the schema:

```bash
npm run db:migrate
```

This runs [lib/db/schema.sql](lib/db/schema.sql): `tasks`, `task_events`, `idempotency_keys`. You can also paste that file straight into the Supabase SQL Editor.

## Run

```bash
npm run dev
```

API served under `http://localhost:3000/api/tasks`.

## Test

```bash
npm test
```

83 [Vitest](https://vitest.dev) tests across 8 files: query builder SQL, Zod validation, filter-to-SQL mapping, pagination math, sync batch logic, route handlers. Repository and service layers are exercised directly; route tests mock the layer one below.

## Authentication

Still a stand-in, not real auth. No session/JWT yet, the "signed-in user" for writes comes from two headers:

```
x-user-id: <string, required>
x-user-name: <string, optional>
```

No `x-user-id`, you get a `401`. `createdBy` always comes from these headers, never the request body, so a client can't forge a creator. Swap the body of `resolveAuthUser` for real session/JWT verification later, nothing that calls it needs to change.

### Authorization

A task is visible to its creator always, and to everyone else only if `visible: true`. Only the creator can edit or delete it (`403` otherwise). A task hidden from you `404`s the same as one that doesn't exist, so existence isn't leaked either way.

## API Reference

Success: `{ "data": ... }`. Failure: `{ "error": { "message": ..., "details": ... } }`.

### `GET /api/tasks`: list and filter

Requires auth. Results are scoped to what you're allowed to see (your own tasks, plus everyone's visible ones), on top of whatever filters you pass.

| Query param  | Example                     | Meaning                                                                                                                                                                               |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `id=t1,t2,t3`                | Match any of these ids. Strings now, ULID/UUID, not integers.                                                                                                                       |
| `status`     | `status=todo,inProgress`    | Match any of `todo`, `inProgress`, `done`.                                                                                                                                          |
| `creator`    | `creator=user-42`           | Match `createdById`.                                                                                                                                                                  |
| `timeField`  | `timeField=end`             | Which column `from`/`to` filter: `start` (default) or `end`.                                                                                                                          |
| `from`, `to` | `from=2026-01-01T00:00:00Z` | Date range on the column `timeField` picks. Either bound alone, or both.                                                                                                              |
| `parentId`   | `parentId=01K8...`            | Subtasks of a given task.                                                                                                                                                            |
| `visible`    | `visible=true`              | Public (`true`) vs. creator-only (`false`).                                                                                                                                           |
| `search`     | `search=invoice`            | Substring match on title/description.                                                                                                                                                 |
| `sort`       | `sort=status,-startTime`    | Comma-separated fields, `-` prefix for descending. Later fields break ties. Default `-createdAt`. Allowed: `id`, `title`, `status`, `startTime`, `endTime`, `createdAt`, `updatedAt`. |
| `limit`      | `limit=20`                  | Page size. Default `50`, max `200`.                                                                                                                                                   |
| `offset`     | `offset=40`                 | Skip N rows. Numbered-page pagination, see below.                                                                                                                                     |
| `cursor`     | `cursor=01K8XR2Q...`        | Rows with `id > cursor`. Keyset pagination, see below.                                                                                                                                |

```bash
curl "http://localhost:3000/api/tasks?status=todo&from=2026-01-01T00:00:00Z&sort=-startTime" \
  -H "x-user-id: user-42"
```

```json
{
  "data": {
    "items": [ /* ... */ ],
    "limit": 50,
    "offset": 40,
    "page": 1,
    "totalPages": 3,
    "total": 120,
    "hasMore": true,
    "nextCursor": null
  }
}
```

`page`, `totalPages`, and `total` are `null` in cursor mode. `nextCursor` is only set in cursor mode, pass it as the next request's `cursor`.

#### `offset` vs. `cursor`

Say you're on page 18,000 of results. With `offset`, Postgres still scans and discards the first 900,000 rows before it can answer, plus runs a `COUNT(*)` for `total`. With `cursor` (`WHERE id > $1 ORDER BY id LIMIT n`), row 900,000 costs the same as row 1, it's a single indexed lookup. `id`s are ULIDs, which sort lexicographically by creation time, so string comparison still gives the right order. The trade: cursor mode drops `total`/`page`, and always orders by `id`, ignoring `sort`. Use `cursor` for infinite scroll, `offset` for small, numbered-page UIs like "page 3 of 12".

### `GET /api/tasks/:id`: view one

Requires auth. `404` if it doesn't exist, is tombstoned, or isn't visible to you.

### `POST /api/tasks`: create

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "content-type: application/json" \
  -H "x-user-id: user-42" -H "x-user-name: Ada" \
  -H "Idempotency-Key: <client-generated uuid, optional>" \
  -d '{"title":"Ship the release","startTime":"2026-01-01T09:00:00Z","endTime":"2026-01-01T17:00:00Z"}'
```

`title`, `startTime`, `endTime` required, `endTime` can't be before `startTime`. `parentId`, `description`, `status` (default `todo`), `visible` (default `true`) optional. `id` optional too, a client-generated ULID; the server makes one if you leave it out. Creator always comes from the auth headers, never the body.

`Idempotency-Key` is optional. Lost the connection right after a POST and not sure if it went through? Resend the exact request with the same key and you get the original task back (`200`, not `201`) instead of a duplicate.

### `PATCH /api/tasks/:id`: update one

Body: any subset of the `POST` fields, plus a required `version`, the value from the task you last read. Say two people edit the same task: whoever saves second sends a now-stale `version` and gets a `409` back with the current task in `error.details.current`, instead of quietly overwriting the first edit.

```bash
curl -X PATCH http://localhost:3000/api/tasks/01K8XR2QC0J8Z6Y8YB2S3D5N9V \
  -H "content-type: application/json" -H "x-user-id: user-42" \
  -d '{"status":"done","version":3}'
```

### `PATCH /api/tasks`: update many

```bash
curl -X PATCH http://localhost:3000/api/tasks \
  -H "content-type: application/json" \
  -d '{"ids":["t1","t2","t3"],"data":{"status":"done"}}'
```

No per-row version check here.

### `DELETE /api/tasks/:id`: delete one

Soft delete, sets `deleted_at`, doesn't remove the row. `404` if it doesn't exist or is already tombstoned. Creator only.

### `DELETE /api/tasks`: delete many, or all

```bash
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -d '{"ids":["t1","t2"]}'
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -d '{"all":true}'
```

`ids` for a specific set, `all: true` for everything, kept as two separate shapes so a malformed body can't be misread as "delete everything." Still a hard delete here, not tombstoned.

### `POST /api/sync`: push a batch of offline-originated operations

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "content-type: application/json" -H "x-user-id: user-42" \
  -d '{"operations":[{"id":"op-1","operation":"create","entityId":"t1","payload":{...}}]}'
```

Say a phone goes offline, queues a create, an update, then a delete on the same task, then reconnects. Operations apply in order, so that sequence can't get reordered into something else. Each operation's own `id` doubles as its idempotency key: resending the same batch because the client never got a response re-applies nothing. Returns `{ accepted: string[], conflicts: [...], rejected: [...] }`. A version conflict lands in `conflicts` (retriable once reconciled), an auth or not-found failure in `rejected` with `permanent: true`, anything unexpected in `rejected` with `permanent: false` (worth retrying).

### `GET /api/sync?cursor=...`: pull changes since a cursor

Reads from `task_events`, not `tasks` directly. That's what lets a tombstoned task still reach a client whose only copy is the old, non-deleted one. Returns a page of events plus a `nextCursor`.

## Scaling to 1 million users

The current stack (Supabase Postgres, a `pg` pool, Next.js route handlers) holds up fine to real but moderate traffic. Past that, in priority order:

1. **Default to `cursor`, not `offset`.** See "offset vs. cursor" above, same reasoning at scale: `offset=900000` degrades, `cursor` doesn't.
2. **Stay on Supabase's connection pooler** (already set up here, see Install), and size the pool for the whole fleet of app instances, not one. Ten instances each opening ten direct connections is the fastest way to take Postgres down.
3. **Rate limit with shared state.** A Redis-backed token bucket keyed by user id, not an in-process counter. Two app instances, two separate counters, the limit stops meaning anything.
4. **Move bulk operations to a background job.** `DELETE /api/tasks` with `{"all": true}` on tens of millions of rows would blow past any request timeout. Enqueue it instead: return `202 Accepted` with a job id, delete in batches from a worker.
5. **Push change delivery instead of polling.** A million clients hitting `GET /api/sync?cursor=...` on a timer is a million wasted requests when nothing changed. Supabase Realtime pushes `task_events` changes to connected clients directly.
6. **Build an offline-first client.** Writes hit a local store first and sync in the background, instead of every click waiting on a round trip. At this scale, "wait for the server to confirm" is its own bottleneck, separate from server capacity, and the gap only gets worse on slow or flaky connections.
7. **Replace `search`'s `LIKE '%term%'`.** A leading wildcard can't use a B-tree index, that's a full table scan on every search. Postgres's own fulltext (`tsvector`/`pg_trgm`) or a dedicated engine like Meilisearch once search is a real feature.
8. **Cache selectively.** `tasks` is write-heavy, so caching `GET /api/tasks` risks serving stale data right after a write. `GET /api/tasks/:id`, invalidated on that task's own update or delete, is safer to start with.
9. **Read replicas**, once a single Postgres primary is actually the bottleneck, not before. Check the pooler and indexing first. Route reads that can tolerate slight staleness (list views) to a replica, keep writes and anything version-sensitive on the primary.
10. **Partition `tasks` by `created_at`** once real traffic patterns are known, on top of the existing indexes on `status`, `created_by_id`, `start_time`, `end_time`, `parent_id` (see [schema.sql](lib/db/schema.sql)):

```sql
CREATE TABLE tasks_2026 PARTITION OF tasks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

Requires converting `tasks` to a partitioned table by `created_at` first, worth doing only once table size is actually the problem, not ahead of time.