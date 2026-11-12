/* ------------------------------------------------------------------
   Local development server (and a fallback for plain Node hosting).

   Vite proxies /api -> this server during `npm run dev`, so the React
   app can call /api/contact in development exactly like it does on
   Vercel. It also serves the built dist/ folder for a local preview.

   All routing lives in server/app.js — the same Express app that
   api/index.js runs as Vercel's single Serverless Function, so local
   and production never drift apart.
   ------------------------------------------------------------------ */

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT) || 3001;

/* Serve the built site (npm run build) so `npm start` gives a full preview.
   Registered after the /api routes in server/app.js, so API 404s stay JSON. */
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback (middleware form works on both Express 4 and 5).
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.use((_req, res) => res.status(404).send("dist/ not found — run `npm run build` first."));
}

/* Dual-stack bind: "::" with ipv6Only:false accepts both IPv6 loopback
   (::1) and IPv4 loopback (127.0.0.1), so browsers and tools agree no
   matter which address they resolve "localhost" to. */
app.listen({ port: PORT, host: "::", ipv6Only: false }, () => {
  console.log(`→ API server running at http://localhost:${PORT}/api`);
});
