# Global Tech Task Manager

A Task Manager REST API on Next.js App Router route handlers, backed by Supabase Postgres, with a sync protocol for offline-originated changes.

## Architecture

Three layers, each only aware of the one below it, so any can be swapped alone. Mirrors the `advanceSQL.php` toolkit this was ported from.


| Layer         | File                                               | Responsibility                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query builder | [lib/db/queryBuilder.ts](lib/db/queryBuilder.ts)   | `Condition` in, `{ sql, params }` out. No I/O, cheap to unit test. DB-agnostic, emits `?` placeholders.                                                                                                                                                                                   |
| Execution     | [lib/db/advanceSQL.ts](lib/db/advanceSQL.ts)       | Runs those queries via a shared `pg` pool ([lib/db/pool.ts](lib/db/pool.ts)) against Supabase Postgres. Table-agnostic: `advanceSelect`, `advanceInsert`, `advanceUpdate`, `advanceDelete`, `advanceDeleteAll`. Converts `?` to Postgres's `$1, $2, ...` right before the query goes out. |
| Repository    | [lib/tasks/repository.ts](lib/tasks/repository.ts) | The only file that knows about `tasks` specifically: row/API mapping, filters to `Condition`, transactional writes (task and `task_events` together), optimistic concurrency, tombstones, idempotency.                                                                                    |


Every query is parameterized. Table and column names go through an allow-list check (`assertSafeIdentifier`) instead, since those can't be parameterized.

[lib/validation/task.ts](lib/validation/task.ts) (Zod schemas), [lib/auth.ts](lib/auth.ts) (who's calling, plus `ForbiddenError`), and [lib/http.ts](lib/http.ts) (response envelope) are separate, same reason.

On top of that, [lib/sync/](lib/sync): a push/pull sync protocol for clients that made changes while offline, built on `task_events`. And [lib/auth/](lib/auth) + [lib/users/](lib/users): JWT-based registration and login (see Authentication below).

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with a Supabase Postgres connection string:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DB_CONNECTION_LIMIT=10
JWT_SECRET=<generate with: openssl rand -base64 48>
JWT_EXPIRES_IN=7d
```

Use the pooler connection string (Supabase dashboard, Project Settings, Database, Connection pooling), not the direct `db.<ref>.supabase.co` one. The direct host is IPv6-only and won't resolve on most networks.

`JWT_SECRET` is required — `resolveAuthUser` throws at request time if it's unset. `JWT_EXPIRES_IN` is optional, defaults to `7d`.

Apply the schema:

```bash
npm run db:migrate
```

This runs [lib/db/schema.sql](lib/db/schema.sql): `users`, `tasks`, `task_events`, `idempotency_keys`. You can also paste that file straight into the Supabase SQL Editor.

## Run

```bash
npm run dev
```

API served under `http://localhost:3000/api/tasks`.

## Test

```bash
npm test
```

110 [Vitest](https://vitest.dev) tests across 14 files: query builder SQL, Zod validation, filter-to-SQL mapping, pagination math, sync batch logic, route handlers, JWT sign/verify, password hashing, and the auth/users routes. Repository and service layers are exercised directly; route tests mock the layer one below.

`client/` (the offline client, see below) has its own separate suite: `cd client && npm test`.

## Logs, request IDs and health (TM-5)

**Logs.** JSON, one line per event, on stdout. Set `LOG_LEVEL` to `debug`, `info` (default), `warn`, `error` or `silent`. Passwords, tokens and similar fields are redacted. Each request logs one line with method, path, status and duration.

**Request IDs.** Every request gets an `x-request-id`. If the caller sends a valid one (up to 64 characters of `A-Za-z0-9._-`) it is kept, otherwise a UUID is generated. It comes back in the response header and appears on every log line for that request.

Example: a user reports an error. Ask for the `x-request-id` from the response, search the logs for it, and you see everything that request did.

**New routes** must be exported through the wrapper, or they get no ID and no log line:

```ts
async function handleGET(request: Request) { /* ... */ }
export const GET = withRequestLogging(handleGET);
```

**Health.** `GET /health` runs `SELECT 1` on the database. No auth.

- Database up: `200 {"status":"ok","checks":{"database":"up"}}`
- Database down or slower than 2 seconds: `503 {"status":"error","checks":{"database":"down"}}`, and the real error goes to the logs.



## Authentication (TM-2: real JWT auth)

`x-user-id`/`x-user-name` are gone. `resolveAuthUser` now verifies a signed JWT:

```
Authorization: Bearer <token>
```

Get a token from one of:

### `POST /api/auth/register`

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"ada@example.com","password":"correct horse battery staple","name":"Ada"}'
```

`email`, `password` (min 8 characters) required; `name` optional. `409` if the email is already registered. Returns `{ user, token }` , `user` never includes the password hash.

### `POST /api/auth/login`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
```

Same `{ user, token }` shape. `401` with the same message either way for a wrong password or an unknown email, the password check still runs against a dummy hash even when there's no matching user, so a client can't tell the two apart by response time.

### `POST /api/auth/forgot-password`

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "content-type: application/json" \
  -d '{"email":"ada@example.com"}'
```

Always `200` with the same generic message, whether or not that email has an account, otherwise this endpoint becomes a way to check who's registered. If the account exists, a single-use reset token is generated, stored (hashed, `lib/auth/resetToken.ts`) with a 1 hour expiry, and a reset link is emailed via `sendPasswordResetEmail` ([lib/email/sendPasswordResetEmail.ts](lib/email/sendPasswordResetEmail.ts)), sent with nodemailer using `EMAIL_USER`/`EMAIL_PASSWORD` (see `.env.example`, an app password for providers like Gmail that require one, not the account's real login password).

### `POST /api/auth/reset-password`

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "content-type: application/json" \
  -d '{"token":"<from the emailed/logged link>","password":"a new password, min 8 chars"}'
```

`400` for a token that's missing, already used, or expired, same generic message for all three, nothing here should reveal which. On success: password updated, token marked used so the same link can't work twice, and returns `{ user, token }` (a fresh login), same shape as register/login.

**No frontend for this yet.** The emailed link points at `${APP_URL}/reset-password?token=...`, but that page doesn't exist in this project. There's nothing that needs it to, though: the token is just a string sitting in the URL, so until a real reset-password page exists, grab it from the link by hand and call the endpoint above directly (curl, Postman, etc.). Once a frontend does exist, its only job here is reading `token` off the query string and submitting it, same as this curl example does.

Every other route's `curl` example below assumes you've stashed a token:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}' | jq -r .data.token)
```

No `Authorization` header, or an invalid/expired token, returns `401`. `createdBy` always comes from the token's subject, never the request body, so a client can't forge a creator.

**What actually changed, mechanically:** [lib/auth.ts](lib/auth.ts)'s `resolveAuthUser` swapped from trusting two headers to verifying a signature ([lib/auth/jwt.ts](lib/auth/jwt.ts), HS256 via `jsonwebtoken`, secret in `JWT_SECRET`). That verification is synchronous, which is what keeps every route handler unchanged — no call site had to add `await`. Passwords are hashed with `bcryptjs` ([lib/auth/password.ts](lib/auth/password.ts), cost factor 12) before ever touching the `users` table; the plaintext password is never stored or logged. This is app-owned JWT auth, not Supabase Auth — Supabase's own verification is async, which would force `await` onto every caller. If that's swapped in later, that's a trade to make consciously, not something to discover from a type error.

### Authorization

A task is visible to its creator always, and to everyone else only if `visible: true`. Only the creator can edit or delete it (`403` otherwise). A task hidden from you `404`s the same as one that doesn't exist, so existence isn't leaked either way.

The bulk `PATCH /api/tasks` and `DELETE /api/tasks` routes require auth too, and are scoped to the caller: they only ever touch tasks you created, and ids belonging to anyone else are skipped (they simply don't count toward `affected`). `{ "all": true }` means "all of my tasks", never the whole table.

## API Reference

Success: `{ "data": ... }`. Failure: `{ "error": { "message": ..., "details": ... } }`.

### `GET /api/tasks`: list and filter

Requires auth. Results are scoped to what you're allowed to see (your own tasks, plus everyone's visible ones), on top of whatever filters you pass.


| Query param  | Example                     | Meaning                                                                                                                                                                               |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `id=t1,t2,t3`               | Match any of these ids. Strings now, ULID/UUID, not integers.                                                                                                                         |
| `status`     | `status=todo,inProgress`    | Match any of `todo`, `inProgress`, `done`.                                                                                                                                            |
| `creator`    | `creator=user-42`           | Match `createdById`.                                                                                                                                                                  |
| `timeField`  | `timeField=end`             | Which column `from`/`to` filter: `start` (default) or `end`.                                                                                                                          |
| `from`, `to` | `from=2026-01-01T00:00:00Z` | Date range on the column `timeField` picks. Either bound alone, or both.                                                                                                              |
| `parentId`   | `parentId=01K8...`          | Subtasks of a given task.                                                                                                                                                             |
| `visible`    | `visible=true`              | Public (`true`) vs. creator-only (`false`).                                                                                                                                           |
| `search`     | `search=invoice`            | Substring match on title/description.                                                                                                                                                 |
| `sort`       | `sort=status,-startTime`    | Comma-separated fields, `-` prefix for descending. Later fields break ties. Default `-createdAt`. Allowed: `id`, `title`, `status`, `startTime`, `endTime`, `createdAt`, `updatedAt`. |
| `limit`      | `limit=20`                  | Page size. Default `50`, max `200`.                                                                                                                                                   |
| `offset`     | `offset=40`                 | Skip N rows. Numbered-page pagination, see below.                                                                                                                                     |
| `cursor`     | `cursor=01K8XR2Q...`        | Rows with `id > cursor`. Keyset pagination, see below.                                                                                                                                |


```bash
curl "http://localhost:3000/api/tasks?status=todo&from=2026-01-01T00:00:00Z&sort=-startTime" \
  -H "Authorization: Bearer $TOKEN"
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
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: <client-generated uuid, optional>" \
  -d '{"title":"Ship the release","startTime":"2026-01-01T09:00:00Z","endTime":"2026-01-01T17:00:00Z"}'
```

`title`, `startTime`, `endTime` required, `endTime` can't be before `startTime`. `parentId`, `description`, `status` (default `todo`), `visible` (default `true`) optional. `id` optional too, a client-generated ULID; the server makes one if you leave it out. Creator always comes from the token's subject, never the body.

`Idempotency-Key` is optional. Lost the connection right after a POST and not sure if it went through? Resend the exact request with the same key and you get the original task back (`200`, not `201`) instead of a duplicate. Keys are scoped to the authenticated user (stored under `(user_id, key)`), so another account reusing or guessing your key gets nothing back and creates its own task. A key is also bound to the request it was first used with: reusing it with a *different* body returns `422` instead of quietly handing back the first task. The home-page playground sends a fresh key per attempt, so pressing Create twice shows the `200` replay.

### `PATCH /api/tasks/:id`: update one

Body: any subset of the `POST` fields, plus a required `version`, the value from the task you last read. Say two people edit the same task: whoever saves second sends a now-stale `version` and gets a `409` back with the current task in `error.details.current`, instead of quietly overwriting the first edit.

```bash
curl -X PATCH http://localhost:3000/api/tasks/01K8XR2QC0J8Z6Y8YB2S3D5N9V \
  -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"done","version":3}'
```



### `PATCH /api/tasks`: update many

```bash
curl -X PATCH http://localhost:3000/api/tasks \
  -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"ids":["t1","t2","t3"],"data":{"status":"done"}}'
```

Requires auth. Only updates tasks you created; other ids are skipped. No per-row version check here (bulk work moves to an async job in Module 5).

### `DELETE /api/tasks/:id`: delete one

Soft delete, sets `deleted_at`, doesn't remove the row. `404` if it doesn't exist or is already tombstoned. Creator only.

### `DELETE /api/tasks`: delete many, or all

```bash
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"ids":["t1","t2"]}'
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"all":true}'
```

`ids` for a specific set, `all: true` for every task you own, kept as two separate shapes so a malformed body can't be misread as "delete everything." Requires auth and only deletes your own tasks. This is a tombstone, exactly like `DELETE /api/tasks/:id`: rows get `deleted_at`, a version bump and one `task.deleted` event each (all in one transaction), so a device that syncs later is told the tasks are gone. Permanent removal happens separately: `npm run db:purge` hard-deletes tombstones older than `TOMBSTONE_RETENTION_SECONDS` (default 30 days). A device offline longer than that window must do a full resync instead of an incremental pull.

### `POST /api/sync`: push a batch of offline-originated operations

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"operations":[{"id":"op-1","operation":"create","entityId":"t1","payload":{...}}]}'
```

Say a phone goes offline, queues a create, an update, then a delete on the same task, then reconnects. Operations apply in order, so that sequence can't get reordered into something else. Each operation's own `id` doubles as its idempotency key: resending the same batch because the client never got a response re-applies nothing. Returns `{ accepted: string[], conflicts: [...], rejected: [...] }`. A version conflict lands in `conflicts` (retriable once reconciled), an auth or not-found failure in `rejected` with `permanent: true`, anything unexpected in `rejected` with `permanent: false` (worth retrying).

### `GET /api/sync?cursor=...`: pull changes since a cursor

Reads from `task_events`, not `tasks` directly. That's what lets a tombstoned task still reach a client whose only copy is the old, non-deleted one. Scoped the same way as `GET /api/tasks` — an event for a task you can't see is skipped, though it still advances the cursor so the pull doesn't stall on it. Returns a page of events plus a `nextCursor`.

## Offline client

A separate package ([client/](client)) implementing Module 3: local-first writes via IndexedDB (Dexie), a durable sync queue, and a sync engine that drains that queue against `/api/sync` with exponential backoff and conflict surfacing. See [client/src/index.ts](client/src/index.ts) for the public API. It doesn't make HTTP calls itself — a `SyncClient` implementation (the actual `fetch` calls, including the `Authorization` header above) is injected by whatever app embeds it.

## Scaling to 1 million users

The current stack (Supabase Postgres, a `pg` pool, Next.js route handlers) holds up fine to real but moderate traffic. Past that, in priority order:

1. **Default to** `cursor`**, not** `offset`**.** See "offset vs. cursor" above, same reasoning at scale: `offset=900000` degrades, `cursor` doesn't.
2. **Stay on Supabase's connection pooler** (already implemented btw), and size the pool for the whole fleet of app instances, not one. Ten instances each opening ten direct connections is the fastest way to take Postgres down.
3. **Rate limit with shared state:** A Redis-backed token bucket keyed by user id, not an in-process counter. Two app instances, two separate counters, the limit stops meaning anything.
4. **Move bulk operations to a background job:** `DELETE /api/tasks` with `{"all": true}` on tens of millions of rows would blow past any request timeout. Enqueue it instead: return `202 Accepted` with a job id, delete in batches from a worker.
5. **Push change delivery instead of polling.** A million clients hitting `GET /api/sync?cursor=...` on a timer is a million wasted requests when nothing changed. Supabase Realtime pushes `task_events` changes to connected clients directly.
6. **The offline-first client is already built** ([client/](client)) : writes hit a local store first and sync in the background, instead of every click waiting on a round trip. At this scale, "wait for the server to confirm" is its own bottleneck, separate from server capacity, and the gap only gets worse on slow or flaky connections.
7. **Replace** `search`**'s** `LIKE '%term%'`**:** A leading wildcard can't use a B-tree index, that's a full table scan on every search. Postgres's own fulltext (`tsvector`/`pg_trgm`) or a dedicated engine like Meilisearch once search is a real feature.
8. **Cache selectively.** `tasks` is write-heavy, so caching `GET /api/tasks` risks serving stale data right after a write. `GET /api/tasks/:id`, invalidated on that task's own update or delete, is safer to start with.
9. **Read replicas**, once a single Postgres primary is actually the bottleneck, not before. Check the pooler and indexing first. Route reads that can tolerate slight staleness (list views) to a replica, keep writes and anything version-sensitive on the primary.
10. **Partition** `tasks` **by** `created_at` once real traffic patterns are known, on top of the existing indexes on `status`, `created_by_id`, `start_time`, `end_time`, `parent_id` (see [schema.sql](lib/db/schema.sql)):

```sql
CREATE TABLE tasks_2026 PARTITION OF tasks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

Requires converting `tasks` to a partitioned table by `created_at` first, worth doing only once table size is actually the problem, not ahead of time.