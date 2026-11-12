/* ------------------------------------------------------------------
   Shared building blocks for the finance pages (Ledger, Loans,
   Savings, Accounts) — the same chrome as the Users page, factored
   out so each page stays small:

     • contentHeader(icon, label) — the content-card header node
     • PillBadge — tinted status/type pill
     • RowActions — edit/delete icon buttons for a table cell
     • useToast — toast state + rendered <Snackbar>
     • buildCounts — per-option row counts for FilterMenu
     • ADD_BUTTON_SX — shared Add-button chrome
   ------------------------------------------------------------------ */

import { useCallback, useState } from "react";
import { Alert, Box, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { categoryService } from "../../../services/categoryService";

/** Content-card header: accent icon + uppercase page label. Call at
    module level so the node's identity stays stable across renders. */
export function contentHeader(Icon, label) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          color: "var(--accent)",
          display: "flex",
          "& svg": { fontSize: { xs: 16, sm: 18 } },
        }}
      >
        <Icon />
      </Box>
      <Typography
        component="div"
        sx={{
          fontWeight: 500,
          fontSize: { xs: "0.72rem", sm: "0.85rem" },
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-primary)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}

/** Tinted pill (status/type badge) — `meta` is { label, color }; a muted
    color renders as a neutral pill like the Users page's "User" badge. */
export function PillBadge({ meta, fallback }) {
  const m = meta || { label: fallback ?? "—", color: "var(--text-muted)" };
  const muted = m.color === "var(--text-muted)";
  return (
    <Box
      component="span"
      sx={{
        px: 1,
        py: "1px",
        borderRadius: 999,
        fontSize: "0.62rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        verticalAlign: "middle",
        color: m.color,
        backgroundColor: muted ? "var(--overlay-dark)" : `${m.color}1A`,
        border: `1px solid ${muted ? "var(--border-light)" : `${m.color}33`}`,
      }}
    >
      {m.label}
    </Box>
  );
}

/** Edit + delete icon buttons for a row's Actions cell (tinted boxes).
 *  `extra` renders between the two (e.g. Ledger's status button). */
export function RowActions({ onEdit, onDelete, label = "record", extra = null, leading = null }) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, justifyContent: "center" }}>
      {leading}
      {/* Edit/Delete render only when their callbacks exist (some
          statuses hide them, e.g. Active loans). */}
      {onEdit && (
        <IconButton
          size="small"
          aria-label={`Edit ${label}`}
          onClick={onEdit}
          sx={{
            borderRadius: 1.5,
            color: "var(--accent)",
            backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
            "&:hover": {
              backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
            },
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      )}
      {extra}
      {onDelete && (
        <IconButton
          size="small"
          aria-label={`Delete ${label}`}
          onClick={onDelete}
          sx={{
            borderRadius: 1.5,
            color: "#f44336",
            backgroundColor: "color-mix(in srgb, #f44336 12%, transparent)",
            "&:hover": {
              backgroundColor: "color-mix(in srgb, #f44336 22%, transparent)",
            },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/** Toast state + the <Snackbar> node to render. `showToast` is wrapped
    in useCallback so its identity is stable — the finance pages include
    it in their fetch useCallback deps, and an unstable function here
    would re-arm the fetch effect on every render (infinite refetch +
    flicker loop). */
export function useToast() {
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });
  const showToast = useCallback(
    (message, severity = "success") => setToast({ open: true, message, severity }),
    []
  );

  const close = useCallback(() => setToast((prev) => ({ ...prev, open: false })), []);

  const toastNode = (
    <Snackbar
      open={toast.open}
      autoHideDuration={4000}
      onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      <Alert onClose={close} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
        {toast.message}
      </Alert>
    </Snackbar>
  );

  return { showToast, toastNode };
}

/** { all: rows.length, [value]: count } — per-option counts for a
    FilterMenu, counted over every loaded row. */
export const buildCounts = (rows, field, options) =>
  Object.fromEntries([
    ["all", rows.length],
    ...options
      .filter((o) => o.value !== "all")
      .map((o) => [o.value, rows.filter((r) => r[field] === o.value).length]),
  ]);

/** Live balance for a non-credit account, computed from its ledger
    entries so it always agrees with what the UI shows: opening
    balance + inflows − outflows/charges/payments/transfers-out
    (+ transfer-ins). VOID entries don't count at all, and PENDING
    ones don't either — money only moves once POSTED. */
export function accountBalance(account, ledgerRows) {
  if (!account) return null;
  let bal = Number(account.dOpeningBalance || 0);
  for (const e of ledgerRows || []) {
    if (e.cStatus === "VOID" || e.cStatus === "PENDING") continue;
    const amount = Number(e.dAmount || 0);
    const total = amount + Number(e.dFee || 0);
    if (e.nAccountId === account.nAccountId) {
      if (e.cType === "IN") bal += amount;
      else if (e.cType === "TRF") bal -= total;
      else if (e.cType === "OUT" || e.cType === "PRC" || e.cType === "PAY") bal -= total;
    } else if (e.cType === "TRF" && e.nToAccountId === account.nAccountId) {
      bal += amount;
    }
  }
  return bal;
}

/** Credit-card balance = the credit limit minus the total of unpaid,
    POSTED Credit charges (amount + fee) on that card — i.e. the
    credit still available to spend. Pending and voided charges don't
    count. Returns null for non-credit accounts (callers keep their
    own balance there). */
export function creditBalance(account, ledgerRows) {
  if (!account || account.cAccountType !== "CREDIT") return null;
  const unpaid = (ledgerRows || [])
    .filter(
      (e) =>
        e.nAccountId === account.nAccountId &&
        e.cType === "PRC" &&
        e.bIsPaid !== true &&
        e.cStatus !== "VOID" &&
        e.cStatus !== "PENDING"
    )
    .reduce((sum, e) => sum + Number(e.dAmount || 0) + Number(e.dFee || 0), 0);
  return Number(account.dCreditLimit || 0) - unpaid;
}

/** Sample loan payment schedule. Payments land on the Payment Day of
    each month AFTER the start, through the end month (started Oct,
    3-month term → Nov, Dec, Jan). Amount per month: the Monthly
    Payment, or — when only the rate is known — the principal plus
    the flat interest charged on the FULL principal every month:
    principal × (1 + rate% × term) ÷ term. Returns null when a
    schedule can't be derived. */
export function loanSchedule(loan) {
  const term = Number(loan?.nTermMonths);
  if (!loan?.dStartDate || !term || term <= 0) return null;
  const hasMonthlyPayment = loan.dMonthlyPayment !== "" && loan.dMonthlyPayment != null;
  const hasInterestRate = loan.dInterestRate !== "" && loan.dInterestRate != null;
  if (!hasMonthlyPayment && !hasInterestRate) return null;
  const amount = hasMonthlyPayment
    ? Number(loan.dMonthlyPayment)
    : (Number(loan.dPrincipal || 0) * (1 + (Number(loan.dInterestRate || 0) / 100) * term)) / term;
  const [y, m, d] = String(loan.dStartDate).split("-").map(Number);
  const payDay = Number(loan.nPaymentDay) || d;
  const entries = [];
  for (let i = 1; i <= term; i++) {
    const month = new Date(y, m - 1 + i, 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const due = new Date(month.getFullYear(), month.getMonth(), Math.min(payDay, lastDay));
    entries.push({
      label: `${month.toLocaleDateString("en-US", { month: "long" })} ${month.getFullYear()}`,
      due: due.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }),
      date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(
        due.getDate()
      ).padStart(2, "0")}`,
      amount,
    });
  }
  return entries;
}

/** Find a category by exact name (case-insensitive), creating it if
    it doesn't exist yet. Returns its id, or null when lookups fail. */
export async function ensureCategory(name) {
  try {
    const cats = await categoryService.list().catch(() => []);
    const found = (cats || []).find(
      (c) => (c.strName || "").toLowerCase() === String(name).toLowerCase()
    );
    if (found) return found.nCategoryId;
    const created = await categoryService.create({ strName: name });
    return created?.nCategoryId ?? null;
  } catch {
    return null;
  }
}

/** Shared chrome for the Add buttons (matches the Users page). */
export const ADD_BUTTON_SX = {
  backgroundColor: "var(--accent)",
  color: "var(--bg-primary)",
  fontWeight: 600,
  textTransform: "none",
  borderRadius: 3,
  boxShadow: "none",
  height: { xs: 32, sm: 36 },
  minHeight: { xs: 32, sm: 36 },
  fontSize: { xs: "0.75rem", sm: "0.8rem" },
  px: { xs: 0.75, sm: 1.75 },
  "& .MuiButton-startIcon": { m: { xs: 0, sm: "0 6px 0 -4px" } },
  "& svg": { fontSize: { xs: 16, sm: 18 } },
  "&:hover": {
    backgroundColor: "var(--accent)",
    opacity: 0.9,
    boxShadow: "0 4px 12px var(--shadow-hover)",
  },
};
