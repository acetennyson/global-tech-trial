# Global Tech Task Manager

A task manager REST API on Next.js route handlers and Supabase Postgres, with JWT auth and a sync protocol for changes made offline. The home page (`/`) is an API playground: register, create tasks, reset a password, all against the real endpoints. There is no other UI.

## Architecture

Three layers. Each only knows the one below it.

| Layer         | File                                               | Job                                                                                                                                    |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Query builder | [lib/db/queryBuilder.ts](lib/db/queryBuilder.ts)   | Turns a `Condition` into `{ sql, params }`. No I/O.                                                                                    |
| Execution     | [lib/db/advanceSQL.ts](lib/db/advanceSQL.ts)       | Runs those queries through a shared `pg` pool ([lib/db/pool.ts](lib/db/pool.ts)). Works on any table.                                  |
| Repository    | [lib/tasks/repository.ts](lib/tasks/repository.ts) | The only file that knows about tasks: row mapping, filters, transactional writes, versions, tombstones, idempotency.                   |

All values are parameterized. Table and column names go through an allow-list check (`assertSafeIdentifier`), since they can't be parameterized.

Around that: [lib/validation/](lib/validation) (Zod schemas), [lib/auth/](lib/auth) and [lib/users/](lib/users) (JWT auth), [lib/http.ts](lib/http.ts) (response format), [lib/sync/](lib/sync) (offline sync), [client/](client) (offline client package).

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
JWT_SECRET=<openssl rand -base64 48>
```

Use the pooler connection string (Supabase, Project Settings, Database, Connection pooling). The direct `db.<ref>.supabase.co` host is IPv6-only and won't resolve on most networks. `JWT_SECRET` is required. Every other variable is explained in `.env.example`.

```bash
npm run db:migrate   # creates users, tasks, task_events, idempotency_keys
npm run dev          # http://localhost:3000
```

`db:migrate` is safe to re-run. It also upgrades older databases (per-user idempotency keys, request hashes).

## Tests

```bash
npm test             # app + lib tests (Vitest)
npm run lint
cd client && npm install && npm test   # offline client, separate suite
```

The root run skips `client/`. Route tests mock the repository, repository and service tests mock the database layer.

## Auth

Send `Authorization: Bearer <token>`. No header, or a bad or expired token, returns `401`. The creator of a task always comes from the token, never the body.

```bash
curl -X POST http://localhost:3000/api/auth/register -H "content-type: application/json" \
  -d '{"email":"ada@example.com","password":"correct horse battery staple","name":"Ada"}'

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "content-type: application/json" \
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}' | jq -r .data.token)
```

| Endpoint                        | Notes                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/auth/register`       | `email`, `password` (min 8), optional `name`. `409` if the email exists. Returns `{ user, token }`.                                         |
| `POST /api/auth/login`          | Same response. A wrong password and an unknown email give the same `401` and take the same time (a dummy hash is compared).               |
| `POST /api/auth/forgot-password`| Always `200` with the same message, whether or not the account exists, **including when the email fails to send** (the error is only logged). A `500` for real accounts would reveal who is registered. |
| `POST /api/auth/reset-password` | `{ token, password }`. `400` for a missing, used or expired token (one generic message). On success the token is burned, every other reset link for that user stops working, and you get `{ user, token }`. |

Reset tokens are random, stored hashed, single-use and expire after 1 hour. Passwords are hashed with bcrypt (cost 12).

**Reset page.** The email links to `${APP_URL}/reset-password?token=...`, and that page does not exist. Copy the token from the link and paste it into the "Forgot your password?" section of the playground, or call the endpoint with curl. A real page would only need to read `token` from the URL and POST it.

**Authorization.** A task is visible to its creator, and to everyone else only if `visible: true`. Only the creator can edit or delete it (`403`). A hidden task returns `404`, the same as a missing one.

## Tasks API

Success is `{ "data": ... }`. Failure is `{ "error": { "message", "details" } }`.

### `GET /api/tasks`

Lists your tasks plus everyone's visible ones.

| Param        | Example                     | Meaning                                                                                  |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| `id`         | `id=t1,t2`                  | Match any of these ids                                                                   |
| `status`     | `status=todo,inProgress`    | `todo`, `inProgress`, `done`                                                             |
| `creator`    | `creator=user-42`           | Match `createdById`                                                                      |
| `parentId`   | `parentId=01K8...`          | Subtasks of a task                                                                       |
| `visible`    | `visible=true`              | Public or creator-only                                                                   |
| `search`     | `search=invoice`            | Substring match on title and description                                                 |
| `timeField`  | `timeField=end`             | Column that `from`/`to` filter: `start` (default) or `end`                               |
| `from`, `to` | `from=2026-01-01T00:00:00Z` | Date range, either bound or both                                                         |
| `sort`       | `sort=status,-startTime`    | Comma-separated, `-` for descending. Default `-createdAt`                                |
| `limit`      | `limit=20`                  | Default `50`, max `200`                                                                  |
| `offset`     | `offset=40`                 | Numbered pages                                                                           |
| `cursor`     | `cursor=01K8XR2Q...`        | Keyset pagination (`id > cursor`), ignores `sort`                                        |

```bash
curl "http://localhost:3000/api/tasks?status=todo&sort=-startTime" -H "Authorization: Bearer $TOKEN"
```

`page`, `totalPages` and `total` are `null` in cursor mode. `nextCursor` is only set in cursor mode.

**Offset or cursor?** On page 18,000, `offset` makes Postgres read and throw away 900,000 rows, and it runs a `COUNT(*)`. `cursor` jumps straight to the row. Use `cursor` for infinite scroll and `offset` for small "page 3 of 12" UIs.

### `GET /api/tasks/:id`

`404` if the task is missing, deleted or hidden from you.

### `POST /api/tasks`

```bash
curl -X POST http://localhost:3000/api/tasks -H "content-type: application/json" \
  -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"title":"Ship the release","startTime":"2026-01-01T09:00:00Z","endTime":"2026-01-01T17:00:00Z"}'
```

Required: `title`, `startTime`, `endTime` (not before start). Optional: `description`, `parentId`, `status` (default `todo`), `visible` (default `true`), `id` (a client-made ULID, for offline creates).

**Idempotency-Key** (optional). Example: the connection drops right after you send a create. Resend it with the same key and you get the original task back (`200`, not `201`) instead of a duplicate.
- Keys belong to the user. Someone else sending your key gets nothing back and creates their own task.
- A key is tied to its first request. Same key with a different body returns `422`.

### `PATCH /api/tasks/:id`

Any subset of the create fields plus a required `version`. Example: two people edit one task. The second save carries a stale `version` and gets `409` with the current task in `error.details.current`, so the first edit isn't overwritten.

```bash
curl -X PATCH http://localhost:3000/api/tasks/<id> -H "content-type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"status":"done","version":3}'
```

### `DELETE /api/tasks/:id`

Soft delete: sets `deleted_at` and keeps the row. `404` if already deleted. Creator only.

### `PATCH /api/tasks` and `DELETE /api/tasks` (bulk)

```bash
curl -X PATCH  http://localhost:3000/api/tasks -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"ids":["t1","t2"],"data":{"status":"done"}}'
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"ids":["t1","t2"]}'      # or {"all":true} for all of YOUR tasks
```

Both only touch tasks you created. Other people's ids are skipped and not counted in `affected`. Bulk update has no version check. Bulk delete is a soft delete, the same as single delete: one `task.deleted` event per task, all in one transaction, so offline devices hear about it.

**Purging.** `npm run db:purge` permanently removes tombstones older than `TOMBSTONE_RETENTION_SECONDS` (default 30 days). Schedule it with cron or `pg_cron`. A device that stays offline longer than that must do a full resync.

## Sync

For clients that change tasks offline.

**`POST /api/sync`** pushes a batch of operations (`create`, `update`, `delete`), applied in order. Example: a phone goes offline, creates a task, edits it, deletes it, reconnects. Order matters, so the batch is never run in parallel.

```bash
curl -X POST http://localhost:3000/api/sync -H "content-type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"operations":[{"id":"op-1","operation":"create","entityId":"t1","payload":{...}}]}'
```

Each operation's `id` is its idempotency key. Resending a batch after a lost response re-applies nothing. The response is `{ accepted, conflicts, rejected }`:
- `conflicts`: stale version. Fix and resubmit.
- `rejected` with `permanent: true`: not allowed, not found, or a reused id with different content. Don't retry.
- `rejected` with `permanent: false`: unexpected error. Retry later.

**`GET /api/sync?cursor=...`** returns changes since a cursor, read from `task_events`. That is how a deleted task reaches a device that still holds the old copy. Events for tasks you can't see are skipped but still move the cursor.

## Offline client

[client/](client) is a separate package: writes go to IndexedDB (Dexie) first, a durable queue holds them, and a sync engine pushes to `/api/sync` with exponential backoff and surfaces conflicts. The app embedding it supplies the `fetch` calls. See [client/src/index.ts](client/src/index.ts).

## Logs, request IDs, health

- **Logs** are one JSON line per event on stdout. `LOG_LEVEL` is `debug`, `info` (default), `warn`, `error` or `silent`. Passwords and tokens are redacted. Each request logs method, path, status and duration.
- **Request IDs.** Every response has an `x-request-id`. A valid incoming one (up to 64 characters of `A-Za-z0-9._-`) is kept, otherwise a UUID is made. Example: a user reports an error, you ask for the header, search the logs, and see everything that request did.
- **New routes** must be exported through `withRequestLogging`, or they get no ID and no log line: `export const GET = withRequestLogging(handleGET);`
- **`GET /health`** runs `SELECT 1`. `200` if the database answers, `503` if it is down or slower than 2 seconds.

## Known limitations

- **Same-key race.** Two simultaneous requests with the same brand-new Idempotency-Key can both pass the lookup. The second fails on the primary key with a `500`. Nothing is duplicated, and retrying the key returns the stored task.
- **No rate limiting** on register, login or forgot-password, so the reset email can be spammed.
- **Password reset is not one transaction.** Updating the password, marking the token used and invalidating other tokens are separate statements.
- **`tasks.created_by_id` is not a foreign key** to `users`.
- **Bulk update** has no per-row version check.
- **No reset-password page** (see Auth).

## Scaling to 1 million users

In priority order:

1. **Use `cursor`, not `offset`** (see above).
2. **Stay on Supabase's connection pooler** and size the pool for all app instances together. Ten instances with ten direct connections each can take Postgres down.
3. **Rate limit with shared state.** A Redis token bucket per user. Two instances with their own counters make the limit meaningless.
4. **Make big bulk operations background jobs.** `{"all": true}` on millions of rows would time out. Return `202` with a job id and work in batches.
5. **Push changes instead of polling.** A million clients polling `/api/sync` mostly asks "anything new?" and gets no. Supabase Realtime can push `task_events`.
6. **Keep the offline client.** Writes hit local storage first, so nothing waits on a round trip.
7. **Replace `LIKE '%term%'` search.** A leading wildcard can't use an index. Use `tsvector`/`pg_trgm` or a search engine such as Meilisearch.
8. **Cache carefully.** `tasks` is write-heavy, so a cached list goes stale right after a write. `GET /api/tasks/:id`, cleared on that task's update or delete, is a safer start.
9. **Read replicas** once the primary is the actual bottleneck. Send list views there. Keep writes and version-sensitive reads on the primary.
10. **Partition `tasks` by `created_at`** once real traffic shows the need:

```sql
CREATE TABLE tasks_2026 PARTITION OF tasks FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

This needs `tasks` converted to a partitioned table first. Do it when table size is the problem, not before.
