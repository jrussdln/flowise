/* ------------------------------------------------------------------
   Page-level table: title (with optional icon) + search + "Add"
   button on top of the shared Table.jsx (sorting, pagination, row
   numbers, skeleton, sticky header) and its Pagination.jsx footer.

   Props:
   - title: heading above the search box
   - titleIcon: optional icon node rendered before the title text
   - columns: [{ id, label, align?, minWidth?, format?(value, row),
                 isAction?, sortable?, sortValue? }]
       `id` is the row property (Table.jsx calls it `key`), `format`
       becomes the cell renderer. A column whose id is "actions" (or
       with isAction: true) is never sortable and centres its cells.
   - rows: data objects
   - rowKey: unique per row (falls back to nUserId, then id)
   - searchPlaceholder / searchFields: client-side filtering; a new
       search resets the table to page 1
   - filters: optional node rendered in the search row, right beside
       the search bar (e.g. a FilterMenu dropdown)
   - loading: shows skeleton rows
   - maxHeight: body height for the table (default "35vh", pass null
       for natural height)
   - onAddClick / addButtonLabel: optional primary button
   - emptyMessage: shown when no (filtered) rows match
   ------------------------------------------------------------------ */

import { useMemo, useState } from "react";
import {
  Box,
  TextField,
  Button,
  InputAdornment,
  Typography,
  Stack,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import Table from "./Table";

export default function DataTable({
  title,
  titleIcon,
  columns = [],
  rows = [],
  onAddClick,
  addButtonLabel = "Add New",
  searchPlaceholder = "Search...",
  searchFields,
  filters,
  loading = false,
  rowKey,
  maxHeight,
  emptyMessage = "No records found",
}) {
  const [searchTerm, setSearchTerm] = useState("");

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

  /* Translate this page's column shape into Table.jsx' one. */
  const tableColumns = useMemo(
    () =>
      columns.map((col) => {
        const isAction = col.isAction ?? col.id === "actions";
        return {
          key: col.id,
          label: col.label,
          align: col.align,
          minWidth: col.minWidth,
          sortable: col.sortable,
          sortValue: col.sortValue,
          isAction,
          render: col.format ? (row) => col.format(row[col.id], row) : undefined,
        };
      }),
    [columns]
  );

  const getRowId = (row, rowIndex) =>
    rowKey ? row[rowKey] : row.nUserId ?? row.id ?? rowIndex;

  return (
    <Box sx={{ width: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        {title ? (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            {titleIcon && (
              <Box
                sx={{
                  color: "var(--accent)",
                  display: "flex",
                  "& svg": { fontSize: 18 },
                }}
              >
                {titleIcon}
              </Box>
            )}
            <Typography
              variant="subtitle2"
              component="div"
              sx={{
                fontWeight: 500,
                fontSize: "0.82rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-primary)",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {title}
            </Typography>
          </Stack>
        ) : (
          <Box />
        )}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center" }}
        >
          <TextField
            size="small"
            variant="outlined"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "var(--text-muted)" }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              minWidth: { xs: 100, sm: 260 },
              flex: 1,
              "& .MuiOutlinedInput-root": {
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: 3,
                "& fieldset": {
                  borderColor: "var(--border-medium)",
                },
                "&:hover fieldset": {
                  borderColor: "var(--accent)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "var(--accent)",
                },
              },
            }}
          />
          {/* Filter control sits beside the search bar (e.g. FilterMenu). */}
          {filters}
          {onAddClick && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onAddClick}
              sx={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
                fontWeight: 600,
                textTransform: "none",
                borderRadius: 3,
                px: { xs: 1.5, sm: 2.5 },
                justifyContent: { xs: "center", sm: "flex-start" },
                boxShadow: "none",
                "& .MuiButton-startIcon": { m: { xs: 0, sm: "0 8px 0 -4px" } },
                "&:hover": {
                  backgroundColor: "var(--accent)",
                  opacity: 0.9,
                  boxShadow: "0 4px 12px var(--shadow-hover)",
                },
              }}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {addButtonLabel}
              </Box>
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Sorting, pagination, row numbers and skeleton live in Table.jsx. */}
      <Table
        columns={tableColumns}
        rows={filteredRows}
        getRowId={getRowId}
        loading={loading}
        maxHeight={maxHeight}
        minWidth={650}
        pageResetKey={searchTerm}
        emptyMessage={emptyMessage}
      />
    </Box>
  );
}
