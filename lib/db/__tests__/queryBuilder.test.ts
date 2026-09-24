import { describe, expect, it } from "vitest";
import {
  buildDeleteAllQuery,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
} from "../queryBuilder";

describe("buildSelectQuery", () => {
  it("builds a plain equality WHERE clause", () => {
    const { sql, params } = buildSelectQuery("tasks", "*", { status: "todo" });
    expect(sql).toBe("SELECT * FROM tasks WHERE status = ?");
    expect(params).toEqual(["todo"]);
  });

  it("combines __BETWEEN, __IN and ordering/pagination", () => {
    const { sql, params } = buildSelectQuery("tasks", ["id", "title"], {
      __IN: { status: ["todo", "done"] },
      __BETWEEN: { start_time: ["2026-01-01", "2026-02-01"] },
      __ORDERBY: "start_time",
      __ASC: false,
      __LIMIT: 10,
      __OFFSET: 20,
    });
    expect(sql).toBe(
      "SELECT id, title FROM tasks WHERE start_time BETWEEN ? AND ? AND status IN (?, ?) ORDER BY start_time DESC LIMIT 10 OFFSET 20"
    );
    expect(params).toEqual(["2026-01-01", "2026-02-01", "todo", "done"]);
  });

  it("treats an empty __IN list as never matching, instead of matching everything", () => {
    const { sql, params } = buildSelectQuery("tasks", "*", { __IN: { id: [] } });
    expect(sql).toBe("SELECT * FROM tasks WHERE 1 = 0");
    expect(params).toEqual([]);
  });

  it("ORs __SEARCH across the given columns", () => {
    const { sql, params } = buildSelectQuery("tasks", "*", {
      __SEARCH: { columns: ["title", "description"], term: "urgent" },
    });
    expect(sql).toBe("SELECT * FROM tasks WHERE (title LIKE ? OR description LIKE ?)");
    expect(params).toEqual(["%urgent%", "%urgent%"]);
  });

  it("supports multi-column sort via a __ORDERBY array", () => {
    const { sql } = buildSelectQuery("tasks", "*", {
      __ORDERBY: [
        { column: "status", asc: true },
        { column: "start_time", asc: false },
      ],
    });
    expect(sql).toBe("SELECT * FROM tasks ORDER BY status ASC, start_time DESC");
  });

  it("rejects identifiers that aren't safe SQL names", () => {
    expect(() => buildSelectQuery("tasks; DROP TABLE tasks", "*", {})).toThrow(/Unsafe SQL identifier/);
    expect(() => buildSelectQuery("tasks", "*", { "id = 1 OR 1=1": "x" })).toThrow(/Unsafe SQL identifier/);
  });
});

describe("buildInsertQuery", () => {
  it("builds a parameterized INSERT", () => {
    const { sql, params } = buildInsertQuery("tasks", { title: "Ship it", status: "todo" });
    expect(sql).toBe("INSERT INTO tasks (title, status) VALUES (?, ?)");
    expect(params).toEqual(["Ship it", "todo"]);
  });
});

describe("buildUpdateQuery", () => {
  it("builds a parameterized UPDATE with SET params before WHERE params", () => {
    const { sql, params } = buildUpdateQuery("tasks", { status: "done" }, { id: 5 });
    expect(sql).toBe("UPDATE tasks SET status = ? WHERE id = ?");
    expect(params).toEqual(["done", 5]);
  });

  it("refuses to build an UPDATE with no WHERE condition", () => {
    expect(() => buildUpdateQuery("tasks", { status: "done" }, {})).toThrow(/no WHERE condition/);
  });
});

describe("buildDeleteQuery / buildDeleteAllQuery", () => {
  it("refuses to build a DELETE with no WHERE condition", () => {
    expect(() => buildDeleteQuery("tasks", {})).toThrow(/no WHERE condition/);
  });

  it("buildDeleteAllQuery explicitly deletes everything, unconditionally", () => {
    const { sql, params } = buildDeleteAllQuery("tasks");
    expect(sql).toBe("DELETE FROM tasks");
    expect(params).toEqual([]);
  });
});
