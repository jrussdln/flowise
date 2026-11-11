/* ------------------------------------------------------------------
   Shared SMTP mailer for the contact form.

   Used by BOTH entry points:
     - server/index.js  -> local development / Node hosting
     - api/index.js     -> Vercel serverless function

   Credentials come from environment variables (.env locally,
   Project Settings -> Environment Variables on Vercel).
   ------------------------------------------------------------------ */

import nodemailer from "nodemailer";
import { buildContactEmailHtml, buildContactEmailText } from "./emailTemplate.js";

const SMTP_TIMEOUT_MS = 30000; // 30s, same as the original CodeIgniter config

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // Accepts "ssl://smtp.gmail.com" or plain "smtp.gmail.com".
  const host = (process.env.SMTP_HOST || "ssl://smtp.gmail.com").replace(/^ssl:\/\//i, "");
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = port === 465; // 465 = SSL, 587 = TLS (starttls)

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    socketTimeout: SMTP_TIMEOUT_MS,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
  });

  return transporter;
}

export function isMailerConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Sends the contact form message through SMTP.
 * @returns {Promise<{ok: true} | {ok: false, error: string, debug?: string}>}
 */
export async function sendContactEmail({ email, message, ip, userAgent }) {
  if (!isMailerConfigured()) {
    return { ok: false, error: "Email service is not configured (SMTP_USER / SMTP_PASS missing)." };
  }

  const from = process.env.SMTP_USER;
  const to = process.env.CONTACT_TO_EMAIL || from;
  const sentAt = new Date().toUTCString();

  // Sender in the subject so each message is scannable in the inbox.
  // CR/LF are stripped defensively — a newline here would allow header injection.
  const sender = String(email).replace(/[\r\n]+/g, " ").trim();

  try {
    const data = { email, message, ip, userAgent, sentAt };

    await getTransporter().sendMail({
      from: `"Portfolio Contact Form" <${from}>`,
      to,
      replyTo: email, // replies go back to the visitor
      subject: `New Contact Form Message — ${sender}`,
      text: buildContactEmailText(data),
      html: buildContactEmailHtml(data),
    });

    return { ok: true };
  } catch (err) {
    console.error("[contact] SMTP send failed:", err?.message || err);

    const exposeDetails = process.env.NODE_ENV !== "production";
    return {
      ok: false,
      error: "SMTP send failed",
      debug: exposeDetails ? String(err?.message || err) : undefined,
    };
  }
}
