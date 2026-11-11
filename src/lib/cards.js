/* ------------------------------------------------------------------
   Presentation helpers shared by the three card grids (Loans,
   Savings + Cards — debit/credit cards on tblcards).

   Both `tblloans` and `tblsavings` carry the same two cosmetic
   columns, validated server-side in server/utils/cardMeta.js — and
   `tblcards` reuses them too:

     strColor     accent colour for the card (nullable)
     bIsFavorite  pin the card to the top of the grid

   COLOUR CODES — strColor holds a single letter, exactly like the
   interest period's D/W/M/A (G = Green, R = Red, ...): the dialogs
   offer them as a select, and `colorHex()` turns the code into the
   value the card actually paints. Rows written before the codes
   existed may still hold a raw #rrggbb — those keep working and show
   up in the dialog as a "Custom" option rather than being dropped.

   Sorting rule (both tabs): favourites first, newest first inside
   each group — the API already returns rows newest-first, and the
   sort below is stable on top of that, but the id comparison is kept
   explicit so the order doesn't depend on the caller's input order.
   ------------------------------------------------------------------ */

/* The enumerated choices, in the order the dialog lists them. */
export const CARD_COLORS = [
  { value: "G", label: "Green" },
  { value: "R", label: "Red" },
  { value: "B", label: "Blue" },
  { value: "Y", label: "Yellow" },
  { value: "O", label: "Orange" },
  { value: "P", label: "Purple" },
  { value: "T", label: "Teal" },
  { value: "S", label: "Slate" },
];

const COLOR_HEX = {
  G: "#2e7d32",
  R: "#c62828",
  B: "#1565c0",
  Y: "#f9a825",
  O: "#ef6c00",
  P: "#6a1b9a",
  T: "#00838f",
  S: "#455a64",
};

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** Canonical form of a stored colour: the code itself (upper-cased, so a
 *  lower-case "g" a row may hold still selects "Green"), a legacy hex
 *  (lower-cased, #rgb expanded to #rrggbb — the shape the server stores),
 *  or "" when there's nothing to paint. */
export function normalizeColor(raw) {
  if (typeof raw !== "string") return "";

  const value = raw.trim();
  if (!value) return "";

  const code = value.toUpperCase();
  if (COLOR_HEX[code]) return code;

  if (HEX6.test(value)) return value.toLowerCase();
  if (HEX3.test(value)) {
    const [r, g, b] = value.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

/** Hex for a stored colour: a code ("G") or a legacy "#rrggbb", else
 *  null — only a real value ever reaches the stylesheet. */
export function colorHex(raw) {
  const value = normalizeColor(raw);
  if (!value) return null;
  return COLOR_HEX[value] || value;
}

/** The row's accent colour, or null. */
export function cardColor(row) {
  return colorHex(row?.strColor);
}

/** Select options for the dialog's colour field: None + the codes,
 *  plus a "Custom" entry when the row still holds a legacy hex. */
export function colorOptions(stored = "") {
  const options = [{ value: "", label: "None" }, ...CARD_COLORS];
  const value = normalizeColor(stored);
  if (value && !options.some((opt) => opt.value === value)) {
    options.push({ value, label: `Custom (${value})` });
  }
  return options;
}

/** True only for an actual `true` — the column is nullable, so rows
 *  written before this feature read as null/undefined. */
export function isFavorite(row) {
  return row?.bIsFavorite === true;
}

/** Newest row where ids come back newest-first; favourites pin above. */
export function sortCards(rows = [], idKey) {
  return [...rows].sort((a, b) => {
    const pinned = Number(isFavorite(b)) - Number(isFavorite(a));
    if (pinned !== 0) return pinned;
    return (Number(b?.[idKey]) || 0) - (Number(a?.[idKey]) || 0);
  });
}

/* ------------------------------------------------------------------
   Debit / credit specifics — tblcards.cType ("D" / "C") and its
   display vocabulary, shared by the Cards grid, its dialogs and the
   transaction dialog's card picker.
   ------------------------------------------------------------------ */

export const CARD_TYPES = [
  { value: "D", label: "Debit" },
  { value: "C", label: "Credit" },
];

/** Label for a stored cType — falls back to the raw value (or "—"). */
export function cardTypeLabel(raw) {
  const found = CARD_TYPES.find((t) => t.value === raw);
  return found ? found.label : raw || "—";
}

/** Chip colours for the two card types. */
export const CARD_TYPE_META = {
  D: { label: "Debit", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  C: { label: "Credit", color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.14)" },
};

/** True when the row is a credit card (the only kind with a limit). */
export function isCredit(card) {
  return card?.cType === "C";
}

/** "•••• 1234" from a stored account number — only the last four
 *  digits ever show; an empty/short value just shows dots. */
export function maskAccountNumber(raw) {
  const value = String(raw ?? "").replace(/\s+/g, "");
  if (!value) return "No account number";
  const tail = value.slice(-4);
  return `•••• ${tail}`;
}

/** The card's display title: "BDO •••• 1234", bank name alone, or a
 *  generic fallback when nothing was recorded. */
export function cardTitle(card) {
  const bank = card?.strBankName?.trim();
  const masked = card?.strAccountNumber ? maskAccountNumber(card.strAccountNumber) : null;
  if (bank && masked) return `${bank} ${masked}`;
  return bank || masked || "Untitled card";
}

/** The card's display code — tblcards has no strCode column, so the
 *  code is stamped from the identity, like CARD-0001. */
export function cardCode(card) {
  return card?.nCardId ? `CARD-${String(card.nCardId).padStart(4, "0")}` : "CARD-????";
}

/**
 * Billing due date of a credit-card PURCHASE: a charge made in month M
 * falls due on the card's nDueDay in month M+1 (an October purchase is
 * billed in November on the 20th). A due day past the shorter month's
 * end clamps to that end (31 in a 30-day month -> the 30th). The
 * purchase's calendar day is read off the raw dttCreated string — a
 * wall-clock value, so no timezone can shift it into another month.
 * Mirrors cardDueDate in server/utils/schedule.js (which names the due
 * date in the generated Payment row's title).
 * Returns a Date (render with UTC fields) or null when the purchase is
 * undated or the card carries no billing due day.
 */
export function purchaseDueDate(card, purchase) {
  const day = Number(card?.nDueDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(purchase?.dttCreated ?? ""));
  if (!match) return null;

  let year = Number(match[1]);
  let month = Number(match[2]); // 1-12
  month += 1; // the bill lands the month AFTER the purchase
  if (month > 12) {
    month = 1;
    year += 1;
  }

  /* Last day of the due month — day 0 of the month after it. */
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}
