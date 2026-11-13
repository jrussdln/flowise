/* ------------------------------------------------------------------
   Page-level data table: a normal table inside one bordered panel —
   a header row with the column labels, one row per record with light
   horizontal rules, and a standard MUI pagination footer (themed).
   rows-per-page + prev/next on the right). Column cells can be plain
   values or custom renderers via `format`.

   Filtering/searching lives outside the table: the search field is in
   the page header (HeaderSearch) and filter menus + action buttons
   are published to the content header via useContentChrome.

   Props:
   - columns: [{ id, label, align?, minWidth?, format?(value, row) }]
        `id` is the row property, `format` becomes the cell renderer,
        `align` maps to the cell's text alignment, and `minWidth`
        suggests the column width.
   - rows: data objects
   - rowKey: unique per row (falls back to nUserId, then id)
   - searchPlaceholder / searchFields: client-side filtering. The
        search field itself lives in the page header (HeaderSearch);
        the table only consumes the shared term, and searchPlaceholder
        becomes the header field's placeholder text.
   - loading: shows skeleton rows
   - emptyMessage: shown when no (filtered) rows match
   - pageSizeOptions / initialPageSize: pagination footer options
   - maxHeight: the table body area scrolls past this height (sticky
         header stays put); pass null to let the table grow freely
   - numbered: when true (the default) a leading "#" column shows the
         row number — it continues across pages (26, 27, … on page 2)
   - rowSx: optional (row) => sx object — extra styling per body row
         (e.g. a highlight tint); return undefined for no change
   ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Skeleton,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from "@mui/material";
import { useSearch } from "../../hooks/useSearch";

/* Theme-aware table chrome, painted through CSS variables. */
const cellBaseSx = {
  borderBottom: "1px solid var(--border-light)",
  color: "var(--text-primary)",
};

const headCellSx = {
  ...cellBaseSx,
  /* Override the light default MUI paints behind sticky header cells so
     the header follows the theme (dark mode included). */
  backgroundColor: "var(--bg-secondary)",
  fontWeight: 600,
  fontSize: "0.7rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

const bodyCellSx = {
  ...cellBaseSx,
  py: 1,
};

export default function Table({
  columns = [],
  rows = [],
  rowKey,
  searchPlaceholder = "Search...",
  searchFields,
  loading = false,
  emptyMessage = "No records found",
  /* Pagination choices — "All" (value -1) sits at the top of the
     list; the default page size is 25. */
  pageSizeOptions = [{ value: -1, label: "All" }, 25, 50, 100, 500],
  initialPageSize = 25,
  maxHeight = 360,
  numbered = true,
  rowSx,
}) {
  /* The search field lives in the page header (HeaderSearch); this
     table only consumes the shared term and publishes its placeholder
     so the header describes what is searchable here. */
  const { searchTerm, setPlaceholder } = useSearch();

  useEffect(() => {
    setPlaceholder(searchPlaceholder);
    return () => setPlaceholder("Search…");
  }, [searchPlaceholder, setPlaceholder]);

  /* Pagination state for the footer. */
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const fieldsToSearch = useMemo(() => {
    if (searchFields && searchFields.length > 0) return searchFields;
    return columns.map((col) => col.id);
  }, [searchFields, columns]);

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((row) =>
      fieldsToSearch.some((field) => {
        const val = row[field];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(term);
      })
    );
  }, [rows, searchTerm, fieldsToSearch]);

  const count = filteredRows.length;
  /* "All" mode: one page holding every filtered row. */
  const pageSizeOrAll = pageSize === -1 ? count || 1 : pageSize;
  const pageCount = Math.max(1, Math.ceil(count / pageSizeOrAll));

  /* Keep the current page valid when the row set shrinks (search or
     filter narrowing the list) — derived during render instead of a
     setState-in-effect, so the clamp applies without extra renders. */
  const safePage = Math.min(page, pageCount - 1);

  const paginatedRows = useMemo(
    () =>
      pageSize === -1
        ? filteredRows
        : filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filteredRows, safePage, pageSize]
  );

  const renderCell = (col, row) => {
    if (col.format) return col.format(row[col.id], row);
    const value = row[col.id];
    return value === null || value === undefined || value === "" ? "—" : String(value);
  };

  const getRowId = (row, rowIndex) =>
    rowKey ? row[rowKey] : row.nUserId ?? row.id ?? rowIndex;

  const colWidth = (col) => (col.minWidth ? { width: col.minWidth } : undefined);

  /* Row number for the leading "#" column — continues across pages. */
  const rowNumber = (index) =>
    (pageSize === -1 ? 0 : safePage * pageSize) + index + 1;

  /* How many cells each row holds when the "#" column is on. */
  const cellCount = numbered ? columns.length + 1 : columns.length;

  return (
    <Box
      sx={{
        width: "100%",
        border: "1px solid var(--border-medium)",
        borderRadius: 3,
        backgroundColor: "var(--card-bg)",
        overflow: "hidden",
      }}
    >
      {/* maxHeight caps the scrolling area (stickyHeader keeps the
          labels pinned while the body scrolls under it). */}
      <TableContainer sx={maxHeight != null ? { maxHeight } : undefined}>
        <MuiTable size="small" stickyHeader>
          {/* COLUMN LABELS — all centered */}
          <TableHead>
            <TableRow>
              {numbered && (
                <TableCell align="center" sx={{ ...headCellSx, width: 48 }}>
                  #
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col.id} align="center" sx={headCellSx}>
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              /* LOADING — a few skeleton rows */
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {numbered && (
                    <TableCell align="center" sx={bodyCellSx}>
                      <Skeleton variant="text" width="50%" />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.id} align={col.align} sx={bodyCellSx}>
                      <Skeleton
                        variant="text"
                        width={col.align === "center" ? "50%" : "70%"}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : count === 0 ? (
              /* EMPTY — one full-width row */
              <TableRow>
                <TableCell
                  colSpan={cellCount}
                  align="center"
                  sx={{ ...bodyCellSx, py: 4, color: "var(--text-muted)" }}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, index) => (
                <TableRow key={getRowId(row, index)} hover sx={rowSx ? rowSx(row) : undefined}>
                  {numbered && (
                    <TableCell
                      align="center"
                      sx={{ ...bodyCellSx, width: 48, color: "var(--text-muted)" }}
                    >
                      {rowNumber(index)}
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      align={col.align}
                      sx={{ ...bodyCellSx, ...colWidth(col) }}
                    >
                      {renderCell(col, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </MuiTable>
      </TableContainer>

      {/* FOOTER — standard MUI pagination toolbar: rows-per-page select,
          "1–10 of 23" range and prev/next arrows. Responsive: the
          "Rows per page" label hides on mobile so it fits on one line. */}
      <TablePagination
        component="div"
        count={count}
        page={safePage}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(event) => {
          setPageSize(Number(event.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={pageSizeOptions}
        labelRowsPerPage="Rows per page:"
        labelDisplayedRows={({ from, to, count: total }) =>
          total === 0 ? "No records" : `${from}–${to} of ${total}`
        }
        disabled={loading}
        sx={{
          borderTop: "1px solid var(--border-light)",
          flexShrink: 0,
          color: "var(--text-muted)",
          "& .MuiTablePagination-toolbar": {
            px: { xs: 1.5, sm: 2 },
            py: 1,
            minHeight: { xs: 52, sm: 56 },
            gap: 0.5,
          },
          "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-select":
            {
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              margin: 0,
            },
          "& .MuiTablePagination-selectLabel": {
            display: { xs: "none", sm: "block" },
          },
          "& .MuiTablePagination-input": {
            mr: { xs: 0, sm: 1.5 },
            "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--border-medium)" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent)" },
          },
          "& .MuiTablePagination-actions": {
            ml: { xs: 0.5, sm: 1.5 },
            "& .MuiIconButton-root": { color: "var(--text-primary)" },
          },
        }}
      />
    </Box>
  );
}
