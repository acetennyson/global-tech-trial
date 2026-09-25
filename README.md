# Global Tech Task Manager

A Task Manager REST API on Next.js App Router route handlers, backed by MySQL.

## Architecture

Three layers, each only aware of the one below it, so any can be swapped alone. Mirrors the `advanceSQL.php` toolkit this was ported from.


| Layer         | File                                               | Responsibility                                                                                                                                                                            |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query builder | [lib/db/queryBuilder.ts](lib/db/queryBuilder.ts)   | `Condition` in, `{ sql, params }` out. No I/O, so it's cheap to unit test.                                                                                                                |
| Execution     | [lib/db/advanceSQL.ts](lib/db/advanceSQL.ts)       | Runs those queries via a shared `mysql2` pool ([lib/db/pool.ts](lib/db/pool.ts)). Table-agnostic: `advanceSelect`, `advanceInsert`, `advanceUpdate`, `advanceDelete`, `advanceDeleteAll`. |
| Repository    | [lib/tasks/repository.ts](lib/tasks/repository.ts) | The only file that knows about `tasks` specifically: row/API mapping, filters to `Condition`, and the CRUD functions the routes call.                                                     |


Every query is parameterized (`?` placeholders). Table/column names go through an allow-list check (`assertSafeIdentifier`) instead, since those can't be parameterized.

[lib/validation/task.ts](lib/validation/task.ts) (Zod schemas), [lib/auth.ts](lib/auth.ts) (who's calling), and [lib/http.ts](lib/http.ts) (response envelope) are separate for the same reason.

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=global_tech_taskmanager
DB_CONNECTION_LIMIT=10
```

Create the database and apply the schema:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS global_tech_taskmanager"
npm run db:migrate
```

`db:migrate` runs [lib/db/schema.sql](lib/db/schema.sql), the `tasks` table definition.

## Run

```bash
npm run dev
```

API served under `http://localhost:3000/api/tasks`.

## Test

```bash
npm test
```

45 [Vitest](https://vitest.dev) tests across 5 files: query builder SQL, Zod validation, filter-to-SQL mapping, pagination math, route handlers. FYI, the repository is mocked in route tests.

## Authentication (NOT IMPLEMENTED BTW)

No session/JWT yet. The "signed-in user" for writes comes from two headers, standing in for what a real auth layer i choose for would set:

```
x-user-id: <string, required>
x-user-name: <string, optional>
```

No `x-user-id` returns http response `401`. `createdBy` always comes from these headers, never the request body, so a client can't forge a creator, but you can alter to what works best for you gng... i'm not stingy.

## API Reference

Success: `{ "data": ... }`. Failure: `{ "error": { "message": ..., "details": ... } }`.

### `GET /api/tasks`: list and filter


| Query param  | Example                     | Meaning                                                                                                                                                                               |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `id=1,2,3`                  | Match any of these ids.                                                                                                                                                               |
| `status`     | `status=todo,inProgress`    | Match any of `todo` / `inProgress` / `done`.                                                                                                                                          |
| `creator`    | `creator=user-42`           | Match `createdById`.                                                                                                                                                                  |
| `timeField`  | `timeField=end`             | Which column `from`/`to` filter: `start` (default) or `end`.                                                                                                                          |
| `from`, `to` | `from=2026-01-01T00:00:00Z` | Date range on the column `timeField` picks. Either bound alone, or both.                                                                                                              |
| `parentId`   | `parentId=5`                | Subtasks of task `5`.                                                                                                                                                                 |
| `visible`    | `visible=true`              | Public (`true`) vs. creator-only (`false`).                                                                                                                                           |
| `search`     | `search=invoice`            | Substring match on title/description.                                                                                                                                                 |
| `sort`       | `sort=status,-startTime`    | Comma-separated fields, `-` prefix for descending. Later fields break ties. Default `-createdAt`. Allowed: `id`, `title`, `status`, `startTime`, `endTime`, `createdAt`, `updatedAt`. |
| `limit`      | `limit=20`                  | Page size. Default `50`, max `200`.                                                                                                                                                   |
| `offset`     | `offset=40`                 | Skip N rows. Numbered-page pagination, see below.                                                                                                                                     |
| `cursor`     | `cursor=1234`               | Rows with `id > 1234`. Keyset pagination, see below.                                                                                                                                  |


```bash
curl "http://localhost:3000/api/tasks?status=todo&from=2026-01-01T00:00:00Z&sort=-startTime"
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

`page`, `totalPages`, and `total` are `null` in cursor mode (see below for why). `nextCursor` is only set in cursor mode, as the value to pass as the next request's `cursor`.

#### `offset` vs. `cursor`

`offset` also runs a `COUNT(*)`, so it can return `total`/`page`/`totalPages`, good for "page 3 of 12" UI. Both `COUNT(*)` and `OFFSET n` get slower as `n` grows, since MySQL scans and discards the first `n` rows either way.

`cursor` skips that: `WHERE id > ? ORDER BY id LIMIT n` is a single indexed lookup, so row 100,000 costs the same as row 1. In exchange it drops `total`/`page`, and always orders by `id`, ignoring `sort`. Use `cursor` for infinite scroll, `offset` for numbered pages on small result sets. More in "Scaling to 1 million users" below.

### `GET /api/tasks/:id`: view one

`404` if it doesn't exist.

### `POST /api/tasks`: create

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "content-type: application/json" \
  -H "x-user-id: user-42" -H "x-user-name: Ada" \
  -d '{"title":"Ship the release","startTime":"2026-01-01T09:00:00Z","endTime":"2026-01-01T17:00:00Z"}'
```

`title`, `startTime`, `endTime` required; `endTime` can't be before `startTime`. `parentId`, `description`, `status` (default `todo`), `visible` (default `true`) optional. Creator comes from the auth headers above, not the body.

### `PATCH /api/tasks/:id`: update one

Body: any subset of the `POST` fields.

### `PATCH /api/tasks`: update many

```bash
curl -X PATCH http://localhost:3000/api/tasks \
  -H "content-type: application/json" \
  -d '{"ids":[1,2,3],"data":{"status":"done"}}'
```



### `DELETE /api/tasks/:id`: delete one

`404` if it doesn't exist.

### `DELETE /api/tasks`: delete many, or all

```bash
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -d '{"ids":[1,2,3]}'
curl -X DELETE http://localhost:3000/api/tasks -H "content-type: application/json" -d '{"all":true}'
```

`ids` for a specific set, `all: true` for everything. Kept as two distinct shapes so a malformed body can't be misread as "delete everything."

## Scaling to 1 million users

In priority order:

1. **Default to** `cursor`**, not** `offset`**.** `offset` makes MySQL scan and discard rows before it can answer, so it gets slower as it grows (`offset=900000` is a slower than `offset=0`). `cursor` costs the same at any depth. Keep `offset` only for small, page-numbered views.
2. **Replace** `search`**'s** `LIKE '%term%'`**.** A leading wildcard can't use an index, so it's a full table scan. Add a MySQL fulltext index, or move search to a dedicated engine (`Meilisearch` or something else u want) once it's a real feature.
3. **Add read replicas, and size the connection pool for the whole fleet, not one instance.** reduces the number of connections to be held by one MySQL server, reducing the chance of the hitting connection limit, and request overload on one server.
4. **Rate limit with shared state**, a Redis-backed token bucket keyed by user id, not an in-process counter, which stops working correctly the moment there's more than one app instance.
5. **Cache selectively.** `tasks` is write-heavy, so caching `GET /api/tasks` risks serving stale data right after a write. `GET /api/tasks/:id`, invalidated on that task's own update or delete, is a safer place to start.
6. **Move bulk operations to a background job.** `DELETE /api/tasks` with `{"all": true}` on tens of millions of rows would exceed any request timeout. Enqueue it, return `202 Accepted`, delete in batches from a worker.
7. **load balancing**  with multiple app instances for reducing processing on one server and increasing response time (nginx or any other tool u want)
8. **Complex filters and indexing** (`status`, `created_by_id`, `start_time`, `end_time`, `parent_id` in [schema.sql](lib/db/schema.sql)). Add composite indexes or partition `tasks` by `created_at` once real traffic patterns are known.


```sql
ALTER TABLE tasks
PARTITION BY RANGE (YEAR(created_at)) (
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);
```