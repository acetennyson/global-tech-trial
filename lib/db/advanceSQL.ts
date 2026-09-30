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

// TS port of advanceSQL.php, now on Postgres via `pg` instead of mysql2.

// queryBuilder is DB-agnostic and emits "?" placeholders (its own tests assert on
// that exact SQL). Postgres wants positional "$1, $2, ..." — converting right
// before the query goes over the wire keeps that difference in exactly one place.
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
  // pg has no insertId/LAST_INSERT_ID() equivalent; RETURNING id is the Postgres way,
  // and works whether `id` was client-supplied (offline-created tasks) or server-default.
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
