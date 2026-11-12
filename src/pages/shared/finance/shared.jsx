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
export function RowActions({ onEdit, onDelete, label = "record", extra = null }) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, justifyContent: "center" }}>
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
      {extra}
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
