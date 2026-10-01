import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/advanceSQL", () => ({
  advanceSelect: vi.fn(),
  advanceInsert: vi.fn(),
  advanceUpdate: vi.fn(),
}));

const txQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (fn: (client: { query: typeof txQuery }) => unknown) => fn({ query: txQuery })),
}));

const advanceSQL = await import("@/lib/db/advanceSQL");
const {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPassword,
  createPasswordResetToken,
  findPasswordResetToken,
  markPasswordResetTokenUsed,
  invalidateOtherPasswordResetTokens,
  resetPasswordWithToken,
} = await import("../repository");

beforeEach(() => {
  vi.clearAllMocks();
});

const ROW = {
  id: "user-1",
  email: "ada@example.com",
  password_hash: "hashed",
  name: "Ada",
  created_at: "2026-01-01T00:00:00Z",
};

describe("findUserByEmail", () => {
  it("lowercases the email before querying, and maps the row to camelCase", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([ROW] as never);
    const user = await findUserByEmail("ADA@Example.com");

    expect(advanceSQL.advanceSelect).toHaveBeenCalledWith("users", "*", { email: "ada@example.com" });
    expect(user).toEqual({ id: "user-1", email: "ada@example.com", passwordHash: "hashed", name: "Ada", createdAt: "2026-01-01T00:00:00Z" });
  });

  it("returns null when no user matches", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([] as never);
    expect(await findUserByEmail("nobody@example.com")).toBeNull();
  });
});

describe("findUserById", () => {
  it("returns the mapped user", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([ROW] as never);
    expect(await findUserById("user-1")).toMatchObject({ id: "user-1", email: "ada@example.com" });
  });
});

describe("createUser", () => {
  it("inserts and returns the created user on success", async () => {
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue(undefined as never);
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([ROW] as never);

    const result = await createUser({ email: "Ada@Example.com", passwordHash: "hashed", name: "Ada" });

    expect(result).toEqual({ status: "ok", user: expect.objectContaining({ email: "ada@example.com" }) });
    const [[, insertedRow]] = vi.mocked(advanceSQL.advanceInsert).mock.calls;
    expect(insertedRow).toMatchObject({ email: "ada@example.com", password_hash: "hashed" });
  });

  it("returns email_taken on a unique-constraint violation instead of throwing", async () => {
    const pgError = Object.assign(new Error("duplicate key"), { code: "23505" });
    vi.mocked(advanceSQL.advanceInsert).mockRejectedValue(pgError);

    const result = await createUser({ email: "ada@example.com", passwordHash: "hashed", name: null });
    expect(result).toEqual({ status: "email_taken" });
  });

  it("rethrows an unrelated database error", async () => {
    vi.mocked(advanceSQL.advanceInsert).mockRejectedValue(new Error("connection reset"));
    await expect(createUser({ email: "ada@example.com", passwordHash: "hashed", name: null })).rejects.toThrow("connection reset");
  });
});

describe("updateUserPassword", () => {
  it("updates password_hash for the given user id", async () => {
    vi.mocked(advanceSQL.advanceUpdate).mockResolvedValue(1 as never);
    await updateUserPassword("user-1", "new-hash");
    expect(advanceSQL.advanceUpdate).toHaveBeenCalledWith("users", { password_hash: "new-hash" }, { id: "user-1" });
  });
});

describe("password reset tokens", () => {
  it("createPasswordResetToken inserts a row keyed by user and token hash", async () => {
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue(undefined as never);
    const expiresAt = new Date("2026-02-01T00:00:00Z");

    await createPasswordResetToken("user-1", "abc123hash", expiresAt);

    const [[table, row]] = vi.mocked(advanceSQL.advanceInsert).mock.calls;
    expect(table).toBe("password_reset_tokens");
    expect(row).toMatchObject({ user_id: "user-1", token_hash: "abc123hash", expires_at: expiresAt.toISOString() });
  });

  it("findPasswordResetToken returns null when no row matches", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([] as never);
    expect(await findPasswordResetToken("missing")).toBeNull();
  });

  it("findPasswordResetToken maps a found row, including a null used_at", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([
      { token_hash: "abc123hash", user_id: "user-1", expires_at: "2026-02-01T00:00:00Z", used_at: null },
    ] as never);

    expect(await findPasswordResetToken("abc123hash")).toEqual({
      userId: "user-1",
      expiresAt: "2026-02-01T00:00:00Z",
      usedAt: null,
    });
  });

  it("markPasswordResetTokenUsed sets used_at for the given token hash", async () => {
    vi.mocked(advanceSQL.advanceUpdate).mockResolvedValue(1 as never);
    await markPasswordResetTokenUsed("abc123hash");

    const [[table, row, condition]] = vi.mocked(advanceSQL.advanceUpdate).mock.calls;
    expect(table).toBe("password_reset_tokens");
    expect(row).toHaveProperty("used_at");
    expect(condition).toEqual({ token_hash: "abc123hash" });
  });

  describe("invalidateOtherPasswordResetTokens", () => {
    it("marks every other still-active token for the user as used, excluding the given hash", async () => {
      vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([
        { token_hash: "just-used" },
        { token_hash: "older-link-1" },
        { token_hash: "older-link-2" },
      ] as never);
      vi.mocked(advanceSQL.advanceUpdate).mockResolvedValue(2 as never);

      await invalidateOtherPasswordResetTokens("user-1", "just-used");

      expect(advanceSQL.advanceSelect).toHaveBeenCalledWith("password_reset_tokens", ["token_hash"], {
        user_id: "user-1",
        used_at: null,
      });
      const [[table, row, condition]] = vi.mocked(advanceSQL.advanceUpdate).mock.calls;
      expect(table).toBe("password_reset_tokens");
      expect(row).toHaveProperty("used_at");
      expect(condition).toEqual({ __IN: { token_hash: ["older-link-1", "older-link-2"] } });
    });

    it("does nothing when there are no other active tokens", async () => {
      vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([{ token_hash: "just-used" }] as never);

      await invalidateOtherPasswordResetTokens("user-1", "just-used");

      expect(advanceSQL.advanceUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("resetPasswordWithToken (one transaction)", () => {
  beforeEach(() => txQuery.mockReset());

  it("claims the token, sets the password, and closes other links, all on the same client", async () => {
    txQuery
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1" }] })
      .mockResolvedValueOnce({ rows: [ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await resetPasswordWithToken("tok-hash", "new-hash");

    expect(result).toMatchObject({ status: "ok", user: { id: "user-1", email: "ada@example.com" } });
    expect(txQuery).toHaveBeenCalledTimes(3);
    expect(txQuery.mock.calls[0][0]).toMatch(/used_at IS NULL AND expires_at > NOW\(\)/);
    expect(txQuery.mock.calls[0][1]).toEqual(["tok-hash"]);
    expect(txQuery.mock.calls[1][1]).toEqual(["new-hash", "user-1"]);
    expect(txQuery.mock.calls[2][1]).toEqual(["user-1", "tok-hash"]);
  });

  it("returns invalid_token and touches nothing else when the token is already used or expired", async () => {
    txQuery.mockResolvedValueOnce({ rows: [] });
    expect(await resetPasswordWithToken("tok-hash", "new-hash")).toEqual({ status: "invalid_token" });
    expect(txQuery).toHaveBeenCalledTimes(1);
  });

  it("throws (so the transaction rolls back) if the user row is missing", async () => {
    txQuery.mockResolvedValueOnce({ rows: [{ user_id: "ghost" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(resetPasswordWithToken("tok-hash", "new-hash")).rejects.toThrow(/missing user/);
    expect(txQuery).toHaveBeenCalledTimes(2);
  });
});
