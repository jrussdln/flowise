/* ------------------------------------------------------------------
   Pagination footer for tables — a thin, themed wrapper around MUI's
   TablePagination.

   Used by Table.jsx; also usable on its own in front of any row list.
   Colours use the app's CSS variables (--text-*, --border-*) instead of
   MUI's palette tokens, because this project themes itself through
   `data-theme` on <html> rather than a MUI ThemeProvider — MUI's
   default palette stays light in dark mode.

   Props:
   - count: total number of rows (across all pages)
   - page: current page index (0-based, per MUI convention)
   - rowsPerPage: number of rows shown per page (default 10)
   - onPageChange: (event, newPage) => void
   - onRowsPerPageChange: (event) => void
   - rowsPerPageOptions: selectable page sizes
     (default ["All", 10, 25, 50, 100])

   Note: "All" is the value -1. Consumers must handle it when slicing
   rows, e.g.:
     const rows = rowsPerPage === -1
       ? filteredRows
       : filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
   (Table.jsx already does this.)
   ------------------------------------------------------------------ */

import { TablePagination } from "@mui/material";

export default function Pagination({
  count,
  page,
  rowsPerPage = 10,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [{ label: "All", value: -1 }, 10, 25, 50, 100],
}) {
  return (
    <TablePagination
      component="div"
      count={count}
      page={page}
      onPageChange={onPageChange}
      rowsPerPage={rowsPerPage}
      onRowsPerPageChange={onRowsPerPageChange}
      rowsPerPageOptions={rowsPerPageOptions}
      labelDisplayedRows={({ from, to, count: total }) =>
        rowsPerPage === -1 ? `1–${total} of ${total}` : `${from}–${to} of ${total}`
      }
      sx={{
        borderTop: "1px solid",
        borderColor: "var(--border-light)",
        backgroundColor: "var(--glass-bg-strong)",
        ".MuiTablePagination-toolbar": {
          paddingLeft: 2,
          paddingRight: 1,
          minHeight: 44,
        },
        ".MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows": {
          fontSize: "0.85rem",
          color: "var(--text-muted)",
        },
        /* Native <select> + its icon + the prev/next buttons all take
           MUI's default palette colours, which are unreadable on the
           navy dark theme. */
        ".MuiTablePagination-select": {
          color: "var(--text-primary)",
        },
        ".MuiTablePagination-selectIcon": {
          color: "var(--text-muted)",
        },
        ".MuiTablePagination-actions": {
          ".MuiIconButton-root": {
            color: "var(--text-secondary)",
            padding: 0.5,
            "&:hover": { backgroundColor: "var(--overlay-dark)" },
            "&.Mui-disabled": { color: "var(--text-muted)", opacity: 0.4 },
          },
        },
      }}
    />
  );
}
