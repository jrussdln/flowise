# FloWise

React + Vite app with an Express API backed by Supabase. Data flows
frontend → API → Supabase (the browser never queries the database directly).

## Project structure

```
src/                       React app
  pages/                   Route screens
    shared/overview/       dashboard/ (Dashboard)
    admin/users/           Users (admin-only)
    auth/login/            Login
  services/                API layer — pages call these, never fetch/Supabase
    api.js                 Generic fetch helper for /api/*
    userService.js         User CRUD calls
    authService.js         Login / logout / session restore
  context/AuthContext.jsx  Signed-in user + login()/logout() for the app
  components/              Reusable UI (DataTable, Table, Pagination,
                           Modal, Fields, AccountMenu, ...)
  lib/                     Client-side helpers shared across pages

server/                    Express API (local dev + Node hosting)
  routes/                  URL -> controller wiring (users.route.js,
                           auth.route.js)
  controllers/             Validation + response shaping (user.controller.js,
                           auth.controller.js)
  models/                  Supabase queries — the only code that knows
                           table/column names (user.model.js)
  utils/                   scrypt password hashing + signed session
                           cookies (password.js, session.js)
  config/supabase.js       Server-side Supabase client (lazy, env-driven)
  app.js                   The Express app: every /api route + JSON errors
                           (shared by both entry points)
  index.js                 Local entry point: boots app.js, serves dist/

api/                       Vercel serverless entry point (production)
  index.js                 The ONE Serverless Function — forwards /api/* to
                           server/app.js. (Hobby plan caps a deployment at 12
                           functions; this project uses 1.)
```

To add an endpoint for a new table: model → controller → route (mount it in
`server/app.js`) → a `src/services/<name>Service.js` → page. Vercel runs that
same app through `api/index.js`, so nothing else has to change.

### Environment

`.env.example` lists every variable: `PORT`, Supabase (`SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` for the server, `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` for the browser), and `SESSION_SECRET` (signs auth
session cookies). The server falls back to the `VITE_*` Supabase values if
the server-side ones are unset.

## Authentication (login/logout only)

`POST /api/auth/login` ({ `strUserName`, `strPassword` }) verifies against
`tblusers` and sets an **httpOnly** session cookie (HMAC-signed, 7 days);
`POST /api/auth/logout` clears it; `GET /api/auth/me` restores the session
after a refresh. The `/login` page redirects to the dashboard on success, and
every route under `PageLayout` waits on `RequireAuth` (in
`src/routes/AppRoute.jsx`).

**Admin-only Users tab:** the `/users` route + nav item are gated on
`cType "A"` — hidden in the header nav for other types, and `/users` bounces
non-admins to the dashboard (`RequireAdmin`).

Passwords are stored as **scrypt hashes** (`server/utils/password.js`, no
extra dependencies). Rows created before hashing stored plain text and are
upgraded transparently on the user's next successful sign-in. Failed logins
are rate limited per IP (10 / 15 min).

## Dashboard

The dashboard currently shows only the **Total Balance card header** with a
static amount (`STATIC_BALANCE` in
`src/pages/shared/overview/dashboard/Dashboard.jsx`). Replace that constant
with live data when the API is ready.

## Running locally

1. `cp .env.example .env` and fill in the Supabase + `SESSION_SECRET` values.
2. `npm run dev` — runs the API server and Vite together.

## Deployment (Vercel)

1. Import the repo — build command `vite build`, output directory `dist`
   (auto-detected). `vercel.json` already rewrites `/api/*` to the single
   function in `api/index.js` and everything else to `index.html` (SPA
   fallback).
2. Project → Settings → Environment Variables: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (`.env` is not deployed).
3. Redeploy.

There is deliberately only **one** function: the Hobby plan allows 12
Serverless Functions per deployment, and every file under `api/` counts as
one. Never add a second file under `api/` (put new endpoints in
`server/routes/*.route.js` instead).

Never commit `.env` — it is gitignored.
