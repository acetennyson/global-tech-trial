import nodemailer, { type Transporter } from "nodemailer";

// Same transporter setup as sendPasswordResetEmail.ts (EMAIL_USER / EMAIL_PASSWORD, or
// EMAIL_HOST for plain SMTP).

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) {
    throw new Error("EMAIL_USER / EMAIL_PASSWORD are not set");
  }

  transporter = process.env.EMAIL_HOST
    ? nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT ?? 587),
        secure: process.env.EMAIL_PORT === "465",
        auth: { user, pass },
      })
    : nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: { user, pass },
      });

  return transporter;
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  await getTransporter().sendMail({
    from,
    to,
    subject: "Verify your email",
    text: `Welcome. Verify this email address to confirm it's yours: ${verifyUrl}\n\nYou can already sign in and read your tasks without verifying, but creating, editing, deleting, and syncing tasks need a verified email first.\n\nThis link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
    html: `
      <p>Welcome. Verify this email address to confirm it's yours:</p>
      <p><a href="${verifyUrl}">Verify your email</a></p>
      <p>You can already sign in and read your tasks without verifying, but creating, editing, deleting, and syncing tasks need a verified email first.</p>
      <p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
    `,
  });
}
