/* ------------------------------------------------------------------
   Express application — routing only: no listen(), no static files.

   Two entrypoints share this exact app, so local dev and Vercel run the
   same routing / body-parsing / validation code:

     • server/index.js → `npm run dev` / `npm start` (also serves dist/)
     • api/index.js    → the single Vercel Serverless Function for /api/*
   ------------------------------------------------------------------ */

import express from "express";
import authRouter from "./routes/auth.route.js";
import usersRouter from "./routes/users.route.js";
import accountsRouter from "./routes/accounts.route.js";
import loansRouter from "./routes/loans.route.js";
import savingsRouter from "./routes/savings.route.js";
import ledgerRouter from "./routes/ledger.route.js";
import categoriesRouter from "./routes/categories.route.js";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "16kb" }));

/* Auth API — login/logout/session (routes -> controller -> model). */
app.use("/api/auth", authRouter);

/* Users API — routes -> controllers -> models (Supabase). */
app.use("/api/users", usersRouter);

/* Finance APIs — all scoped to the signed-in user (server/utils/owner.js). */
app.use("/api/accounts", accountsRouter);
app.use("/api/loans", loansRouter);
app.use("/api/savings", savingsRouter);
app.use("/api/ledger", ledgerRouter);
app.use("/api/categories", categoriesRouter);

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
