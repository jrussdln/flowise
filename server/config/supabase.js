/* ------------------------------------------------------------------
   Server-side Supabase client.

   Every database query lives in server/models/* — the browser never
   talks to Supabase directly (it goes through /api/* instead; see
   src/services/ for the frontend API layer).

   Environment (see .env.example):
     SUPABASE_URL              falls back to VITE_SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY falls back to SUPABASE_ANON_KEY, then
                               VITE_SUPABASE_ANON_KEY

   The client is created lazily on first use so `import "dotenv/config"`
   in server/index.js has already loaded .env by the time it runs.
   ------------------------------------------------------------------ */

import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const err = new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (see .env.example)."
    );
    err.status = 500;
    throw err;
  }

  client = createClient(url, key);
  return client;
}
