/**
 * Pure SQL builders. Nothing in this file opens a database connection or
 * performs any I/O: every function just returns a `{ sql, params }` pair for
 * a parameterized (`?`) query. That's what lets these functions be unit
 * tested directly, with plain assertions on the generated SQL string,
 * instead of needing a real database to run against.
 *
 * This is modeled after the `advanceSelect`/`advanceInsert`/`advanceUpdate`/
 * `advanceDelete` toolkit in elementTouch/server/advanceSQL.php, adapted so
 * every value is always bound as a parameter instead of being written
 * directly into the SQL string.
 */

export interface BuiltQuery {
  sql: string;
  params: unknown[];
}

export interface SortSpec {
  column: string;
  asc?: boolean;
}

/** Special condition keys understood by `buildWhere` (mirrors the `__KEY` convention from advanceSQL.php). */
export interface ConditionModifiers {
  __GREATER?: Record<string, unknown>;
  __LESSER?: Record<string, unknown>;
  __BETWEEN?: Record<string, [unknown, unknown]>;
  __IN?: Record<string, unknown[]>;
  __SEARCH?: { columns: string[]; term: string };
  /** A single column (paired with `__ASC`) or an ordered list for multi-column sort, e.g. `[{column:"status"}, {column:"startTime", asc:false}]`. */
  __ORDERBY?: string | SortSpec[];
  __ASC?: boolean;
  __LIMIT?: number;
  __OFFSET?: number;
}

export type Condition = Record<string, unknown> & ConditionModifiers;

const MODIFIER_KEYS = new Set([
  "__GREATER",
  "__LESSER",
  "__BETWEEN",
  "__IN",
  "__SEARCH",
  "__ORDERBY",
  "__ASC",
  "__LIMIT",
  "__OFFSET",
]);

function assertSafeIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: "${name}"`);
  }
}

/** Builds a `WHERE ...` clause (without the leading `WHERE`) plus its param list, and trailing ORDER BY / LIMIT. */
export function buildWhere(condition: Condition = {}): {
  where: string;
  params: unknown[];
  suffix: string;
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const { __GREATER, __LESSER, __BETWEEN, __IN, __SEARCH, __ORDERBY, __ASC, __LIMIT, __OFFSET } =
    condition;

  if (__GREATER) {
    for (const [key, value] of Object.entries(__GREATER)) {
      assertSafeIdentifier(key);
      clauses.push(`${key} >= ?`);
      params.push(value);
    }
  }

  if (__LESSER) {
    for (const [key, value] of Object.entries(__LESSER)) {
      assertSafeIdentifier(key);
      clauses.push(`${key} <= ?`);
      params.push(value);
    }
  }

  if (__BETWEEN) {
    for (const [key, [min, max]] of Object.entries(__BETWEEN)) {
      assertSafeIdentifier(key);
      clauses.push(`${key} BETWEEN ? AND ?`);
      params.push(min, max);
    }
  }

  if (__IN) {
    for (const [key, values] of Object.entries(__IN)) {
      assertSafeIdentifier(key);
      if (values.length === 0) {
        // An empty list must match nothing, not everything: `column IN ()` is
        // invalid SQL, and skipping the clause entirely would silently turn
        // this filter off instead of returning zero rows. `1 = 0` forces the
        // whole query to return no rows, which is the correct result for
        // "match one of these zero values."
        clauses.push("1 = 0");
        continue;
      }
      clauses.push(`${key} IN (${values.map(() => "?").join(", ")})`);
      params.push(...values);
    }
  }

  if (__SEARCH && __SEARCH.term) {
    const searchClauses = __SEARCH.columns.map((col) => {
      assertSafeIdentifier(col);
      return `${col} LIKE ?`;
    });
    if (searchClauses.length) {
      clauses.push(`(${searchClauses.join(" OR ")})`);
      searchClauses.forEach(() => params.push(`%${__SEARCH.term}%`));
    }
  }

  for (const [column, value] of Object.entries(condition)) {
    if (MODIFIER_KEYS.has(column)) continue;
    assertSafeIdentifier(column);
    if (value === null || value === undefined) {
      clauses.push(`${column} IS NULL`);
    } else {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  let suffix = "";
  if (typeof __ORDERBY === "string") {
    assertSafeIdentifier(__ORDERBY);
    suffix += ` ORDER BY ${__ORDERBY} ${__ASC === false ? "DESC" : "ASC"}`;
  } else if (__ORDERBY && __ORDERBY.length > 0) {
    __ORDERBY.forEach((spec) => assertSafeIdentifier(spec.column));
    const parts = __ORDERBY.map((spec) => `${spec.column} ${spec.asc === false ? "DESC" : "ASC"}`);
    suffix += ` ORDER BY ${parts.join(", ")}`;
  }
  if (typeof __LIMIT === "number") {
    suffix += ` LIMIT ${Math.max(0, Math.trunc(__LIMIT))}`;
    if (typeof __OFFSET === "number") {
      suffix += ` OFFSET ${Math.max(0, Math.trunc(__OFFSET))}`;
    }
  }

  return { where: clauses.join(" AND "), params, suffix };
}

export function buildSelectQuery(
  table: string,
  columns: string[] | "*" = "*",
  condition: Condition = {}
): BuiltQuery {
  assertSafeIdentifier(table);
  if (columns !== "*") columns.forEach(assertSafeIdentifier);
  const select = columns === "*" ? "*" : columns.join(", ");
  const { where, params, suffix } = buildWhere(condition);
  const sql = `SELECT ${select} FROM ${table}${where ? ` WHERE ${where}` : ""}${suffix}`;
  return { sql, params };
}

export function buildInsertQuery(table: string, data: Record<string, unknown>): BuiltQuery {
  assertSafeIdentifier(table);
  const columns = Object.keys(data);
  if (columns.length === 0) {
    throw new Error(`buildInsertQuery: no columns provided for table "${table}"`);
  }
  columns.forEach(assertSafeIdentifier);
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
  return { sql, params: Object.values(data) };
}

export function buildUpdateQuery(
  table: string,
  data: Record<string, unknown>,
  condition: Condition
): BuiltQuery {
  assertSafeIdentifier(table);
  const setColumns = Object.keys(data);
  if (setColumns.length === 0) {
    throw new Error(`buildUpdateQuery: no columns to update for table "${table}"`);
  }
  setColumns.forEach(assertSafeIdentifier);
  const setClause = setColumns.map((c) => `${c} = ?`).join(", ");
  const setParams = Object.values(data);

  const { where, params: whereParams } = buildWhere(condition);
  if (!where) {
    throw new Error(`buildUpdateQuery: refusing to update table "${table}" with no WHERE condition`);
  }

  const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
  return { sql, params: [...setParams, ...whereParams] };
}

export function buildDeleteQuery(table: string, condition: Condition): BuiltQuery {
  assertSafeIdentifier(table);
  const { where, params } = buildWhere(condition);
  if (!where) {
    throw new Error(`buildDeleteQuery: refusing to delete from table "${table}" with no WHERE condition`);
  }
  const sql = `DELETE FROM ${table} WHERE ${where}`;
  return { sql, params };
}

/**
 * Deletes every row in `table`, with no WHERE clause at all. This is kept as
 * its own function, separate from `buildDeleteQuery`, so that a missing or
 * mistakenly empty condition can never be silently treated as "delete
 * everything": `buildDeleteQuery` always requires a real condition, and this
 * function is the only way to delete everything on purpose.
 */
export function buildDeleteAllQuery(table: string): BuiltQuery {
  assertSafeIdentifier(table);
  return { sql: `DELETE FROM ${table}`, params: [] };
}
