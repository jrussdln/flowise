/* ------------------------------------------------------------------
   Shared request handling for the contact form.

   Both entry points (server/index.js locally, api/index.js on Vercel)
   call handleContact() so validation, spam protection and responses
   stay identical in development and production.
   ------------------------------------------------------------------ */

import { sendContactEmail } from "./mailer.js";

export const MAX_EMAIL_LENGTH = 254;
export const MIN_MESSAGE_LENGTH = 10;
export const MAX_MESSAGE_LENGTH = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Simple in-memory rate limit: per-IP, max 5 messages / 10 minutes.
   Note: on serverless this is per warm instance, so it is a soft guard —
   the honeypot below does the heavier spam lifting. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateLimitHits = new Map();

function isRateLimited(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  const recent = (rateLimitHits.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(key, recent);
    return true;
  }

  recent.push(now);
  rateLimitHits.set(key, recent);

  if (rateLimitHits.size > 2000) {
    for (const [k, v] of rateLimitHits) {
      if (v.every((ts) => now - ts >= RATE_LIMIT_WINDOW_MS)) rateLimitHits.delete(k);
    }
  }

  return false;
}

export function validateContact(body = {}) {
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();
  const errors = {};

  if (!email) {
    errors.email = "Please enter your email address.";
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    errors.email = "That email address doesn't look right.";
  }

  if (!message) {
    errors.message = "Please write a message.";
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    errors.message = `A few more words, please (${MIN_MESSAGE_LENGTH} characters minimum).`;
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`;
  }

  return { email, message, errors };
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * @param {{ body?: object, headers?: object, ip?: string }} req
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleContact(req) {
  const body = req.body || {};
  const ip = req.ip || getClientIp({ headers: req.headers });
  const userAgent = req.headers?.["user-agent"] || "";

  // Honeypot: real users never see this field, bots fill it in.
  // Answer 200 so the bot doesn't learn anything.
  if (body.website) {
    return { status: 200, body: { ok: true, message: "Your message has been sent successfully!" } };
  }

  const { email, message, errors } = validateContact(body);
  if (Object.keys(errors).length > 0) {
    return { status: 400, body: { ok: false, message: "Please fix the highlighted fields.", errors } };
  }

  if (isRateLimited(ip)) {
    return {
      status: 429,
      body: { ok: false, message: "Too many messages sent. Please wait a few minutes and try again." },
    };
  }

  const result = await sendContactEmail({ email, message, ip, userAgent });

  if (result.ok) {
    return { status: 200, body: { ok: true, message: "Your message has been sent successfully!" } };
  }

  return {
    status: 502,
    body: {
      ok: false,
      message: "Sorry, your message could not be sent. Please email me directly instead.",
      ...(result.debug ? { debug: result.debug } : {}),
    },
  };
}
