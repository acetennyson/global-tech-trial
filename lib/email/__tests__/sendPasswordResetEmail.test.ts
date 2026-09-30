import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.EMAIL_HOST;
  delete process.env.EMAIL_PORT;
  delete process.env.EMAIL_SERVICE;
  delete process.env.EMAIL_FROM;
  process.env.EMAIL_USER = "bot@example.com";
  process.env.EMAIL_PASSWORD = "app-password";
});

describe("sendPasswordResetEmail", () => {
  it("sends the reset link to the given address, defaulting to the gmail preset", async () => {
    const { sendPasswordResetEmail } = await import("../sendPasswordResetEmail");
    await sendPasswordResetEmail("ada@example.com", "http://localhost:3000/reset-password?token=abc");

    expect(createTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "bot@example.com", pass: "app-password" },
    });
    const [[mailOptions]] = sendMail.mock.calls;
    expect(mailOptions.to).toBe("ada@example.com");
    expect(mailOptions.from).toBe("bot@example.com");
    expect(mailOptions.text).toContain("http://localhost:3000/reset-password?token=abc");
    expect(mailOptions.html).toContain("http://localhost:3000/reset-password?token=abc");
  });

  it("uses EMAIL_FROM instead of EMAIL_USER when set", async () => {
    process.env.EMAIL_FROM = "no-reply@example.com";
    const { sendPasswordResetEmail } = await import("../sendPasswordResetEmail");
    await sendPasswordResetEmail("ada@example.com", "http://localhost:3000/reset-password?token=abc");

    const [[mailOptions]] = sendMail.mock.calls;
    expect(mailOptions.from).toBe("no-reply@example.com");
  });

  it("switches to plain SMTP when EMAIL_HOST is set, ignoring EMAIL_SERVICE", async () => {
    process.env.EMAIL_HOST = "smtp.example.com";
    process.env.EMAIL_PORT = "465";
    const { sendPasswordResetEmail } = await import("../sendPasswordResetEmail");
    await sendPasswordResetEmail("ada@example.com", "http://localhost:3000/reset-password?token=abc");

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "bot@example.com", pass: "app-password" },
    });
  });

  it("throws a clear error when EMAIL_USER/EMAIL_PASSWORD aren't set", async () => {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;
    const { sendPasswordResetEmail } = await import("../sendPasswordResetEmail");

    await expect(sendPasswordResetEmail("ada@example.com", "http://localhost:3000/x")).rejects.toThrow(
      /EMAIL_USER/
    );
    expect(createTransport).not.toHaveBeenCalled();
  });
});
