/* ------------------------------------------------------------------
   The single Vercel Serverless Function for this app.

   Why one file: the Hobby plan caps a deployment at 12 Serverless
   Functions, and every file under api/ counts as one. We used to ship
   14 thin wrappers (api/loans.js, api/loans/[id].js, api/auth/*.js, ...)
   — now there is exactly one, and it hands the request straight to the
   shared Express app in server/app.js, which owns all routing, body
   parsing and validation. Local dev (`server/index.js`) runs that same
   app, so the two environments cannot drift apart.

   vercel.json rewrites /api/* here, keeping the original path:
     GET /api/loans/5  →  this function, req.url = "/api/loans/5?..."
   The ?__path= fallback below covers the case where only the query is
   forwarded, so Express always sees the real URL either way.
   ------------------------------------------------------------------ */

import app from "../server/app.js";

export default function handler(req, res) {
  try {
    /* Restore the original path if the rewrite only forwarded it as a
       query parameter, and drop the helper param so Express' req.query
       stays clean. (If Vercel forwards the original path — the usual
       case — this is a no-op.) */
    const url = new URL(req.url, "http://vercel.local");
    const forwarded = url.searchParams.get("__path");
    if (forwarded !== null) {
      url.searchParams.delete("__path");
      req.url = `/api/${forwarded}${url.search}`;
    }

    /* If Vercel already read the body, express.json() sees a finished
       stream and keeps Vercel's parsed req.body; otherwise it parses. */
    return app(req, res);
  } catch (err) {
    console.error("[api] unexpected error:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: "Unexpected server error." });
    }
    return undefined;
  }
}
