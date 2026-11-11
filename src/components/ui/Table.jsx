/* ------------------------------------------------------------------
   Reusable table on MUI: built-in sorting, pagination, row numbers,
   loading skeleton and (optional) a sticky header with an internally
   scrolling body.

   Used by DataTable.jsx (which adds the page chrome — title, search,
   "Add" button — on top of it).

   Props:
   - columns: [{
       key: string,                 // property read from the row
       label: string,
       align?: "left" | "right" | "center",
       minWidth?: number,           // px, column width floor
       render?: (row, rowIndex) => ReactNode,   // overrides row[key]
       sortable?: boolean,          // default: true unless col.isAction
       sortValue?: (row) => string | number,    // overrides row[key] when sorting
       isAction?: boolean           // not sortable, cells centre themselves
     }]
   - rows: array of data objects
   - getRowId: (row, rowIndex) => key   (defaults to row.id)
   - rowsPerPageOptions: selectable page sizes
     (default ["All", 10, 25, 50, 100])
   - defaultRowsPerPage: initial page size (default 10)
   - emptyMessage: text shown when rows is empty
   - loading: renders skeleton rows instead of data
   - skeletonRowCount: skeleton rows while loading (default: rowsPerPage)
   - maxHeight: body height (px number or CSS size, default "35vh"). When
     set, the header sticks and the body scrolls inside the Paper instead
     of growing the page. Pass null for the table's natural height.
   - pageResetKey: any value — changing it jumps back to page 1
     (DataTable passes the search term so a new search starts at page 1)
   - sx: extra styles merged into the Paper

   Alignment:
   - Header cells are always centred; body cells default to "left".
   - col.align applies to body cells only, so a column's data can line
     up (e.g. right) while its header label stays centred.

   Sorting:
   - Click a column header to sort ascending; click again for
     descending. Clicking a *different* column always starts ascending.
   - Uses col.sortValue(row) if provided, else row[col.key]; strings
     compare case-insensitively (with numeric awareness), numbers and
     dates compare naturally, nulls sort first.

   A "#" column is prepended automatically, numbered across sorting and
   pagination.

   Example:
     <Table
       columns={[
         { key: "strSource", label: "Source" },
         { key: "cCategory", label: "Category", align: "center" },
         { key: "dAmount", label: "Amount", align: "right",
           render: (row) => `₱${Number(row.dAmount).toLocaleString()}` },
       ]}
       rows={entries}
       getRowId={(row) => row.nTransactionId}
       loading={isFetching}
     />
   ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import {
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Skeleton,
} from "@mui/material";
import Pagination from "./Pagination";
import { skeletonBar } from "./skeletonStyles";

export default function Table({
  columns = [],
  rows = [],
  getRowId = (row, rowIndex) => row.id ?? rowIndex,
  rowsPerPageOptions = [{ label: "All", value: -1 }, 10, 25, 50, 100],
  defaultRowsPerPage = 25,
  emptyMessage = "No records found.",
  loading = false,
  skeletonRowCount,
  maxHeight = "60vh",
  minWidth,
  pageResetKey,
  sx,
}) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState("asc");

  const handlePageChange = (_event, newPage) => setPage(newPage);
  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (col) => {
    if (orderBy === col.key) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(col.key);
      setOrder("asc");
    }
    setPage(0);
  };

  /* A new search (or any external filter) starts back at page 1. */
  useEffect(() => {
    setPage(0);
  }, [pageResetKey]);

  const isShowingAll = rowsPerPage === -1;

  /* Row numbers keep counting across pages: "#11" is page 2, row 1. */
  const firstRowIndex = isShowingAll ? 0 : page * rowsPerPage;

  const allColumns = useMemo(
    () => [
      {
        key: "__rowNumber",
        label: "#",
        align: "center",
        sortable: false,
        minWidth: 48,
        render: (_row, rowIndex) => firstRowIndex + rowIndex + 1,
      },
      ...columns,
    ],
    [columns, firstRowIndex]
  );

  const sortedRows = useMemo(() => {
    const activeCol = allColumns.find((col) => col.key === orderBy);
    if (!activeCol) return rows;

    const getValue = activeCol.sortValue
      ? activeCol.sortValue
      : (row) => row[activeCol.key];

    const compare = (a, b) => {
      const valA = getValue(a);
      const valB = getValue(b);

      if (valA == null && valB == null) return 0;
      if (valA == null) return -1;
      if (valB == null) return 1;

      if (typeof valA === "string" || typeof valB === "string") {
        return String(valA).localeCompare(String(valB), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      if (valA < valB) return -1;
      if (valA > valB) return 1;
      return 0;
    };

    const sorted = [...rows].sort(compare);
    return order === "asc" ? sorted : sorted.reverse();
  }, [rows, allColumns, orderBy, order]);

  /* Keep the page inside the page count when rows disappear (a search,
     a delete) — otherwise MUI warns about an out-of-range page and the
     table shows an empty body. */
  const pageCount = isShowingAll
    ? 1
    : Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const safePage = Math.min(page, pageCount - 1);
  const paginatedRows = isShowingAll
    ? sortedRows
    : sortedRows.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const skeletonCount = skeletonRowCount ?? (isShowingAll ? rows.length : rowsPerPage);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: "0.75rem",
        overflow: "hidden",
        borderColor: "var(--border-medium)",
        backgroundColor: "var(--glass-bg-strong)",
        backdropFilter: "blur(12px)",
        boxShadow: "var(--glass-shadow)",
        ...sx,
      }}
    >
      <TableContainer sx={maxHeight ? { maxHeight } : undefined}>
        <MuiTable
          size="small"
          stickyHeader={Boolean(maxHeight)}
          aria-label="data table"
          sx={minWidth ? { minWidth } : undefined}
        >
          <TableHead>
            <TableRow sx={{ backgroundColor: "var(--overlay-dark)" }}>
              {allColumns.map((col) => {
                const isSortable = col.sortable ?? !col.isAction;
                /* Headers always centre — col.align only moves the body
                   cells, so e.g. an Amount column can right-align its
                   values under a centred label. */
                const align = "center";

                return (
                  <TableCell
                    key={col.key}
                    align={align}
                    sortDirection={orderBy === col.key ? order : false}
                    sx={{
                      fontWeight: 500,
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      borderColor: "var(--border-light)",
                      whiteSpace: "nowrap",
                      /* Column width floor — declared on the header only,
                         which is enough for the browser to size the column. */
                      minWidth: col.minWidth,
                      /* Sticky headers must be opaque or the rows show
                         through while the body scrolls. */
                      ...(maxHeight && { backgroundColor: "var(--card-bg)" }),
                    }}
                  >
                    {isSortable ? (
                      <TableSortLabel
                        active={orderBy === col.key}
                        direction={orderBy === col.key ? order : "asc"}
                        onClick={() => handleSort(col)}
                        sx={{
                          color: "var(--text-muted)",
                          "&.Mui-active": { color: "var(--accent)" },
                          "& .MuiTableSortLabel-icon": {
                            color: "inherit",
                            opacity: 0.6,
                          },
                        }}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : (
                      col.label
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: skeletonCount }).map((_, rowIndex) => (
                <TableRow key={`skeleton-row-${rowIndex}`} sx={{ "& td": { borderColor: "var(--border-light)" } }}>
                  {allColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? "left"}
                      sx={{ fontSize: "0.85rem" }}
                    >
                      <Skeleton
                        variant="text"
                        sx={{
                          ...skeletonBar,
                          fontSize: "0.85rem",
                          mx: col.align === "center" ? "auto" : undefined,
                          ml: col.align === "right" ? "auto" : undefined,
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  align="center"
                  sx={{ py: 4, color: "var(--text-muted)", fontSize: "0.85rem" }}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <TableRow
                  key={getRowId(row, rowIndex)}
                  hover
                  sx={{
                    "&:hover": { backgroundColor: "var(--overlay-dark)" },
                    "& td": { borderColor: "var(--border-light)" },
                  }}
                >
                  {allColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? "left"}
                      sx={{
                        fontSize: "0.85rem",
                        color: "var(--text-primary)",
                        ...(col.isAction && {
                          /* Keep the cell a real table-cell so it stretches
                             to the row's full height (a flex <td> collapses
                             to its content and the buttons drift to the top
                             of taller, multi-line rows) — vertical-align
                             then centres them, text-align centres them
                             horizontally. */
                          verticalAlign: "middle",
                          textAlign: "center",
                        }),
                      }}
                    >
                      {col.render ? col.render(row, rowIndex) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </MuiTable>
      </TableContainer>

      {rows.length > 0 && (
        <Pagination
          count={sortedRows.length}
          page={safePage}
          rowsPerPage={rowsPerPage}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={rowsPerPageOptions}
        />
      )}
    </Paper>
  );
}
