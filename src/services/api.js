/* ------------------------------------------------------------------
   Tiny fetch helper for our own API (/api/*).

   Vite proxies /api -> Express during `npm run dev`; in production the
   same paths hit api/*.js on Vercel (or the Express server), so the
   frontend never needs to know the difference.

   All responses are JSON of the shape { ok, data?, message?, errors? }.
   Anything non-OK (or a network failure) throws an Error whose message
   is safe to show in a toast; `err.errors` carries field-level errors
   when the server sends them.
   ------------------------------------------------------------------ */

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Please check your connection and try again.");
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    /* non-JSON body — fall through to the generic error below */
  }

  if (!response.ok || json?.ok === false) {
    const error = new Error(json?.message || `Request failed (${response.status}).`);
    error.errors = json?.errors;
    error.status = response.status;
    throw error;
  }

  return json;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};
