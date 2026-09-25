import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
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

type Executor = Pool | PoolConnection;

// TS port of advanceSQL.php. Same names, bound params instead of interpolation.

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
  const { sql, params } = buildCountQuery(table, countCondition);
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

/** the `{all:true}` path. */
export async function advanceDeleteAll(table: string, conn: Executor = getPool()): Promise<number> {
  const { sql, params } = buildDeleteAllQuery(table);
  const [result] = await conn.query<ResultSetHeader>(sql, params);
  return result.affectedRows;
}
