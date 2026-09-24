import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool";
import {
  buildDeleteAllQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
  type Condition,
} from "./queryBuilder";

type Executor = Pool | PoolConnection;

/**
 * Table-agnostic CRUD helpers, all parameterized. TypeScript port of the
 * advanceSelect/advanceInsert/advanceUpdate/advanceDelete toolkit from
 * elementTouch/server/advanceSQL.php — same shape and intent (a small,
 * reusable data-access layer any route/module can call), but every value is
 * bound as a `?` placeholder instead of interpolated into the SQL string.
 */

export async function advanceSelect<T extends RowDataPacket = RowDataPacket>(
  table: string,
  columns: string[] | "*" = "*",
  condition: Condition = {},
  conn: Executor = getPool()
): Promise<T[]> {
  const { sql, params } = buildSelectQuery(table, columns, condition);
  const [rows] = await conn.query<T[]>(sql, params);
  return rows;
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
  const { sql, params } = buildSelectQuery(table, ["COUNT(*) AS count"], countCondition);
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

export async function advanceInsert(
  table: string,
  data: Record<string, unknown>,
  conn: Executor = getPool()
): Promise<number> {
  const { sql, params } = buildInsertQuery(table, data);
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result.insertId;
}

export async function advanceUpdate(
  table: string,
  data: Record<string, unknown>,
  condition: Condition,
  conn: Executor = getPool()
): Promise<number> {
  const { sql, params } = buildUpdateQuery(table, data, condition);
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}

export async function advanceDelete(
  table: string,
  condition: Condition,
  conn: Executor = getPool()
): Promise<number> {
  const { sql, params } = buildDeleteQuery(table, condition);
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}

/** Deletes every row in `table`. Separate from `advanceDelete` on purpose — see `buildDeleteAllQuery`. */
export async function advanceDeleteAll(table: string, conn: Executor = getPool()): Promise<number> {
  const { sql, params } = buildDeleteAllQuery(table);
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}
