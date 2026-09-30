import nodemailer, { type Transporter } from "nodemailer";

// Real email, via nodemailer. Auth is just an email + its password (an app

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

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  await getTransporter().sendMail({
    from,
    to,
    subject: "Reset your password",
    text: `Someone requested a password reset for this account.\n\nReset your password: ${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.\n\nThis link expires in 1 hour.`,
    html: `
      <p>Someone requested a password reset for this account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>If you didn't request this, you can ignore this email, your password won't change.</p>
      <p>This link expires in 1 hour.</p>
    `,
  });
}
