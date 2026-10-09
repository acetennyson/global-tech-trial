import nodemailer, { type Transporter } from "nodemailer";

// Same transporter setup as sendPasswordResetEmail.ts (EMAIL_USER / EMAIL_PASSWORD, or
// EMAIL_HOST for plain SMTP). Kept as a separate file, one function per email, rather than
// a shared transporter module, to match the existing lib/email/ layout.

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

export async function sendNewsletterWelcomeEmail(to: string, unsubscribeUrl: string): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  await getTransporter().sendMail({
    from,
    to,
    subject: "You're subscribed",
    text: `You're subscribed to news and updates about the Task Manager API.\n\nDidn't ask for this? Unsubscribe here, no account or sign-in needed: ${unsubscribeUrl}`,
    html: `
      <p>You're subscribed to news and updates about the Task Manager API.</p>
      <p>Didn't ask for this? <a href="${unsubscribeUrl}">Unsubscribe</a>, no account or sign-in needed.</p>
    `,
  });
}
