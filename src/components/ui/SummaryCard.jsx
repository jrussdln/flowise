/* ------------------------------------------------------------------
   One glass KPI card — the shared shape behind the summary row on the
   Income/Expense, Loans and Savings tabs (each of those pages used to
   carry its own copy of this exact component):

     TOTAL INCOME            <- uppercase caption label
     ₱ 12,345.00             <- headline value, tinted by `color`
     This month ₱ 3,200.00    <- `hint`: where the number comes from
                                              [icon]

   The hint line is the point of the component: a bare total doesn't
   say anything on its own, so every metric passes one ("This month
   ₱…", "12.5% margin", "4 active loans", "All repayments on track").

   Props:
   - label: string — caption above the value
   - value: node — the headline (money / count / percentage)
   - color: string — value + icon colour (default var(--accent))
   - icon: node — icon pinned to the right
   - hint: node — supporting line under the value
   - hintColor: string — optional colour for the hint (default muted)
   ------------------------------------------------------------------ */

import { Box, Paper, Stack, Typography } from "@mui/material";

export default function SummaryCard({
  label,
  value,
  color = "var(--accent)",
  icon,
  hint,
  hintColor,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        minWidth: 0,
        height: "100%",
        p: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        backgroundColor: "var(--glass-bg-strong)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border-medium)",
        boxShadow: "var(--glass-shadow)",
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        /* MUI v9 Stack only honours these through `sx` — as props they
           leak to the DOM as attributes and never become CSS. */
        sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
              fontSize: "0.65rem",
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{ color, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", mt: 0.25, lineHeight: 1.3 }}
          >
            {value}
          </Typography>
          {hint ? (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mt: 0.25,
                fontWeight: 500,
                fontSize: "0.65rem",
                color: hintColor || "var(--text-muted)",
              }}
            >
              {hint}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ color, opacity: 0.85, display: "flex", mt: 0.25 }}>{icon}</Box>
      </Stack>
    </Paper>
  );
}

/**
 * The grid the cards sit in: one per row on phones, two on tablets,
 * four side by side from `lg` up. The old flex row started squeezing
 * four cards into ~150px each somewhere around 700px.
 */
export function SummaryGrid({ children, sx }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        mb: 3,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
