import { Box, Stack, Typography } from "@mui/material";

/**
 * Filter cards — a horizontal row of toggle cards (All / In / Out / ...),
 * each showing its label and optional row count. The active card is
 * highlighted with the accent; the whole row scrolls horizontally when
 * it doesn't fit, so the choices always stay aligned in one line.
 *
 * Props (mirrors FilterMenu, so the two are interchangeable):
 * - value:    the selected option's value
 * - onChange: called with the new value when a card is picked
 * - options:  [{ value, label }]
 * - counts:   { [value]: number } — per-option row counts (optional)
 * - label:    aria-label for the group (default "Filter")
 * - title:    small caption rendered before the cards (optional)
 */
export default function FilterCards({
  value,
  onChange,
  options = [],
  counts = {},
  label = "Filter",
  title,
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        /* Each group gets its own container box — title + cards stay
           visibly together. Inline-flex so the group sits on the same
           line as other groups when space allows, and wraps as a unit
           to the next line when it doesn't. */
        display: "inline-flex",
        flexWrap: "wrap",
        alignItems: "center",
        rowGap: 0.5,
        maxWidth: "100%",
        minWidth: 0,
        border: "1px solid var(--border-light)",
        borderRadius: 2.5,
        px: 1,
        py: 0.5,
      }}
      role="group"
      aria-label={label}
    >
      {title && (
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
            fontSize: "0.56rem",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </Typography>
      )}

      {/* One line of cards when they fit; they wrap to the next line
          when they don't, instead of scrolling sideways. */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          minWidth: 0,
          flexWrap: "wrap",
          rowGap: 0.5,
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          const count = counts[opt.value];
          return (
            <Box
              key={opt.value}
              component="button"
              type="button"
              aria-pressed={selected}
              aria-label={`${opt.label}${count != null ? ` (${count})` : ""}`}
              onClick={() => !selected && onChange?.(opt.value)}
              sx={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                height: { xs: 22, sm: 26 },
                px: { xs: 0.9, sm: 1.1 },
                borderRadius: 2,
                border: "1px solid",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: { xs: "0.62rem", sm: "0.7rem" },
                fontWeight: selected ? 700 : 500,
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.15s ease-out",
                ...(selected
                  ? {
                      borderColor: "var(--accent)",
                      color: "var(--accent)",
                      backgroundColor:
                        "color-mix(in srgb, var(--accent) 12%, transparent)",
                      boxShadow: "0 1px 6px color-mix(in srgb, var(--accent) 18%, transparent)",
                    }
                  : {
                      borderColor: "var(--border-medium)",
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-secondary)",
                      "&:hover": {
                        borderColor: "var(--accent)",
                        color: "var(--text-primary)",
                      },
                    }),
                "&:focus-visible": {
                  outline: "2px solid var(--accent)",
                  outlineOffset: 1,
                },
              }}
            >
              {opt.label}
              {count != null && (
                <Box
                  component="span"
                  sx={{
                    px: 0.6,
                    py: "0.5px",
                    borderRadius: 999,
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    lineHeight: 1.6,
                    ...(selected
                      ? {
                          color: "var(--accent)",
                          backgroundColor:
                            "color-mix(in srgb, var(--accent) 18%, transparent)",
                        }
                      : {
                          color: "var(--text-muted)",
                          backgroundColor: "var(--overlay-dark)",
                        }),
                  }}
                >
                  {count}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
