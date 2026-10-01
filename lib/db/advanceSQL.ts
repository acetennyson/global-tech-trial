import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getPool } from "./pool";
import {
  buildCountQuery,
  buildDeleteAllQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  type Condition,
} from "./queryBuilder";

type Executor = Pool | PoolClient;

// Runs queryBuilder output against Postgres via `pg`.

// queryBuilder emits "?" placeholders. Postgres wants "$1, $2, ...", converted here.
function toPositional(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export async function advanceSelect<T extends QueryResultRow = QueryResultRow>(
  table: string,
  columns: string[] | "*" = "*",
  condition: Condition = {},
  conn: Executor = getPool()
): Promise<T[]> {
  const { sql, params } = buildSelectQuery(table, columns, condition);
  const result = await conn.query<T>(toPositional(sql), params);
  return result.rows;
}

export async function advanceCount(
  table: string,
  condition: Condition = {},
  conn: Executor = getPool()
): Promise<number> {
  const countCondition: Condition = { ...condition };
  delete countCondition.__ORDERBY;
  delete countCondition.__ASC;
  delete countCondition.__LIMIT;
  delete countCondition.__OFFSET;
  const { sql, params } = buildCountQuery(table, countCondition);
  const result = await conn.query<{ count: string }>(toPositional(sql), params);
  return Number(result.rows[0]?.count ?? 0);
}

export async function advanceInsert(
  table: string,
  data: Record<string, unknown>,
  conn: Executor = getPool()
): Promise<string> {
  const { sql, params } = buildInsertQuery(table, data);
  // Every table with an `id` column gets it back. Tables without one (idempotency_keys has
  // a composite key of user_id + key) must NOT ask for it, or Postgres errors with
  // `column "id" does not exist`.
  if (!("id" in data)) {
    await conn.query(toPositional(sql), params);
    return "";
  }
  const result = await conn.query<{ id: string }>(`${toPositional(sql)} RETURNING id`, params);
  return result.rows[0].id;
}

export async function advanceUpdate(
  table: string,
  data: Record<string, unknown>,
  condition: Condition,
  conn: Executor = getPool()
): Promise<number> {
  const { sql, params } = buildUpdateQuery(table, data, condition);
  const result = await conn.query(toPositional(sql), params);
  return result.rowCount ?? 0;
}

export async function advanceDelete(
  table: string,
  condition: Condition,
  conn: Executor = getPool()
): Promise<number> {
  const { sql, params } = buildDeleteQuery(table, condition);
  const result = await conn.query(toPositional(sql), params);
  return result.rowCount ?? 0;
}

/** the `{all:true}` path. */
export async function advanceDeleteAll(table: string, conn: Executor = getPool()): Promise<number> {
  const { sql, params } = buildDeleteAllQuery(table);
  const result = await conn.query(toPositional(sql), params);
  return result.rowCount ?? 0;
}
