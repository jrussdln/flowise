/* ------------------------------------------------------------------
   Express application — routing only: no listen(), no static files.

   Two entrypoints share this exact app, so local dev and Vercel run the
   same routing / body-parsing / validation code:

     • server/index.js → `npm run dev` / `npm start` (also serves dist/)
     • api/index.js    → the single Vercel Serverless Function for /api/*
   ------------------------------------------------------------------ */

import express from "express";
import { handleContact } from "./contact.js";
import authRouter from "./routes/auth.route.js";
import budgetPlansRouter from "./routes/budgetPlans.route.js";
import cardsRouter from "./routes/cards.route.js";
import entriesRouter from "./routes/entries.route.js";
import loansRouter from "./routes/loans.route.js";
import savingsRouter from "./routes/savings.route.js";
import transactionsRouter from "./routes/transactions.route.js";
import usersRouter from "./routes/users.route.js";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "16kb" }));

app.post("/api/contact", async (req, res) => {
  try {
    const { status, body } = await handleContact({
      body: req.body,
      headers: req.headers,
      ip: req.ip,
    });
    res.status(status).json(body);
  } catch (err) {
    console.error("[contact] unexpected error:", err);
    res.status(500).json({ ok: false, message: "Unexpected server error." });
  }
});

/* Wrong method on an existing endpoint -> 405. */
app.all("/api/contact", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).json({ ok: false, message: "Method not allowed" });
});

/* Auth API — login/logout/session (routes -> controller -> model). */
app.use("/api/auth", authRouter);

/* Users API — routes -> controllers -> models (Supabase). */
app.use("/api/users", usersRouter);

/* Transactions API — Income/Expense ledger. */
app.use("/api/transactions", transactionsRouter);

/* Loans API — pending/active loans per user. */
app.use("/api/loans", loansRouter);

/* Savings API — pending/active savings goals per user. */
app.use("/api/savings", savingsRouter);

/* Budget Plans API — named plans per user (no money attached). */
app.use("/api/budget-plans", budgetPlansRouter);

/* Cards API — the user's debit + credit cards (tblcards). */
app.use("/api/cards", cardsRouter);

/* Entries API — payment schedules generated on loan activation. */
app.use("/api/entries", entriesRouter);

/* Unknown /api paths -> JSON 404. */
app.use("/api", (_req, res) => res.status(404).json({ ok: false, message: "Not found" }));

/* JSON-friendly errors for API routes (e.g. a malformed request body),
   instead of Express' default HTML stack trace page. */
/* eslint-disable no-unused-vars */
app.use("/api", (err, _req, res, _next) => {
  const status = err?.type === "entity.parse.failed" ? 400 : err?.status || err?.statusCode || 500;
  console.error("[api] error:", err?.message || err);
  res.status(status).json({
    ok: false,
    message: status === 400 ? "Invalid JSON body." : "Unexpected server error.",
  });
});
/* eslint-enable no-unused-vars */

export default app;
