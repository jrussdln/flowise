/* ------------------------------------------------------------------
   Shared validation for the two cosmetic columns both card tables
   carry (`tblloans` and `tblsavings`):

     strColor     accent colour painted on the card (nullable)
     bIsFavorite  "pin this card to the top of the grid" flag

   They are user-owned but purely presentational — no money math reads
   them — so they get their own normaliser instead of a block in each
   controller's field-by-field validate(). Both controllers call
   applyCardMeta() with their own `values` / `errors` objects.

   Server-owned fields (ids, nUserId, dttCreated, strCode, cStatus)
   stay out of here.
   ------------------------------------------------------------------ */

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/**
 * The enumerated colour codes strColor accepts — one letter, exactly
 * like the interest period's D/W/M/A (G = Green, R = Red, ...). The
 * card maps the code to a hex in src/lib/cards.js.
 */
export const COLOR_CODES = ["G", "R", "B", "Y", "O", "P", "T", "S"];

/**
 * Normalises a colour request.
 *   "g" / "G"      -> { ok: true, value: "G" }        (enumerated code)
 *   "#2E7D32"      -> { ok: true, value: "#2e7d32" }  (legacy hex, kept)
 *   "#abc"         -> { ok: true, value: "#aabbcc" }
 *   "" / null      -> { ok: true, value: null }       (clears the accent)
 *   anything else  -> { ok: false }                   (caller sets the error)
 */
export function parseColor(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false }; // numbers/objects aren't colours

  const value = raw.trim();
  if (!value) return { ok: true, value: null };

  const code = value.toUpperCase();
  if (value.length === 1 && COLOR_CODES.includes(code)) return { ok: true, value: code };

  if (HEX6.test(value)) return { ok: true, value: value.toLowerCase() };

  if (HEX3.test(value)) {
    const [r, g, b] = value.slice(1).split("");
    return { ok: true, value: `#${r}${r}${g}${g}${b}${b}`.toLowerCase() };
  }

  return { ok: false };
}

/**
 * Normalises the favourite flag. Booleans pass through (and `null`
 * clears it); the strings/numbers HTML hands over are accepted too.
 * Anything else -> { ok: false }.
 */
export function parseFavorite(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "boolean") return { ok: true, value: raw };
  if (raw === 1 || raw === 0) return { ok: true, value: raw === 1 };

  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "true" || value === "1") return { ok: true, value: true };
    if (value === "false" || value === "0") return { ok: true, value: false };
    if (!value) return { ok: true, value: null };
  }

  return { ok: false };
}

/**
 * Folds strColor / bIsFavorite into a controller's `values` / `errors`.
 *   isNew: always processed (a create without them stores the defaults:
 *          no colour, not a favourite).
 *   update: only when the key is present, so a partial update that
 *           doesn't mention them leaves the stored value alone.
 */
export function applyCardMeta(body = {}, { isNew = false } = {}, values, errors) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (isNew || has("strColor")) {
    const parsed = parseColor(body.strColor);
    if (!parsed.ok) {
      errors.strColor = `Colour must be one of ${COLOR_CODES.join(", ")} (or a hex value like #2e7d32).`;
    } else {
      values.strColor = parsed.value;
    }
  }

  if (isNew || has("bIsFavorite")) {
    const parsed = parseFavorite(body.bIsFavorite);
    if (!parsed.ok) {
      errors.bIsFavorite = "Favourite must be true or false.";
    } else {
      /* A create starts every card un-pinned (false reads the same as
         null in the UI, but false is the honest default). */
      values.bIsFavorite = parsed.value ?? (isNew ? false : null);
    }
  }

  return { values, errors };
}

/** True when an update touches ONLY the cosmetic columns — such a write
 *  must not re-run the loan's schedule sync (nothing about the numbers
 *  changed), so the controller can skip it entirely. */
export function isPresentationOnly(values = {}) {
  const keys = Object.keys(values);
  return keys.length > 0 && keys.every((k) => k === "strColor" || k === "bIsFavorite");
}
