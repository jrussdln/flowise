import { useState } from "react";
import { Button, Box, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";

/**
 * Dropdown filter — a button showing the current selection that opens
 * a fixed-width menu of options (All / Active / Pending / ...), each
 * showing its row count e.g. "Active (3)".
 *
 * Props:
 * - value:    the selected option's value
 * - onChange: called with the new value when an option is picked
 * - options:  [{ value, label }]
 * - counts:   { [value]: number } — per-option row counts shown next
 *             to each label (optional)
 * - label:    aria-label for the button (default "Filter")
 */
export default function FilterMenu({ value, onChange, options = [], counts = {}, label = "Filter" }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const current = options.find((opt) => opt.value === value);
  const currentCount = counts[value];

  const handleSelect = (newValue) => {
    setAnchorEl(null);
    if (newValue !== value) onChange?.(newValue);
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<FilterListIcon />}
        endIcon={<ExpandMoreIcon />}
        aria-label={label}
        aria-controls={open ? "filter-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          /* Match the height of a size="small" MUI text field exactly:
             8.5px ×2 padding + 23px line-height = 40px (the search bar
             beside it), not the button default of ~31px. On mobile the
             button collapses to an icon-only square. */
          boxSizing: "border-box",
          height: { xs: 32, sm: 36 },
          minHeight: { xs: 32, sm: 36 },
          minWidth: { xs: 32, sm: 140 },
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-primary)",
          borderColor: "var(--border-medium)",
          backgroundColor: "var(--bg-secondary)",
          textTransform: "none",
          fontWeight: 600,
          fontSize: { xs: "0.7rem", sm: "0.8rem" },
          borderRadius: 3,
          px: { xs: 0.5, sm: 1.25 },
          "& svg": { fontSize: { xs: 15, sm: 16 } },
          whiteSpace: "nowrap",
          "& .MuiButton-startIcon": {
            /* MUI gives startIcon asymmetric margins (-2px left, ~8px
               right) to sit next to a label. With the label hidden on
               mobile those margins survive and push the funnel off
               center — so zero them on xs only. */
            ml: { xs: 0, sm: 0.5 },
            mr: { xs: 0, sm: 1 },
          },
          "& .MuiButton-endIcon": {
            ml: "auto",
            mr: { xs: 0, sm: 0.5 },
            display: { xs: "none", sm: "flex" },
          },
          "&:hover": {
            borderColor: "var(--accent)",
            backgroundColor: "var(--bg-secondary)",
          },
        }}
      >
        <Box
          component="span"
          sx={{ display: { xs: "none", sm: "inline" } }}
        >
          {current?.label ?? value ?? "All"}
          {currentCount != null && (
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>&nbsp;({currentCount})</span>
          )}
        </Box>
      </Button>

      <Menu
        id="filter-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 180,
              width: 180,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              boxShadow: "var(--glass-shadow)",
            },
          },
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          const count = counts[opt.value];
          return (
            <MenuItem
              key={opt.value}
              selected={selected}
              onClick={() => handleSelect(opt.value)}
              sx={{
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                fontWeight: selected ? 600 : 400,
                justifyContent: "space-between",
                "&:hover": { backgroundColor: "var(--overlay-dark)" },
                "&.Mui-selected": {
                  backgroundColor: "var(--overlay-dark)",
                  color: "var(--accent)",
                  "&:hover": { backgroundColor: "var(--overlay-dark)" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {selected && <CheckIcon fontSize="small" sx={{ color: "var(--accent)" }} />}
              </ListItemIcon>
              <ListItemText sx={{ flex: 1 }}>{opt.label}</ListItemText>
              {count != null && (
                <Typography
                  variant="caption"
                  sx={{
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    minWidth: 24,
                    textAlign: "right",
                  }}
                >
                  ({count})
                </Typography>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
