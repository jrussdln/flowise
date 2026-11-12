import { useState } from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import {
  AccountBalanceWallet as BalanceIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";

/* Static data for now — replace with live API data later. */
const STATIC_BALANCE = 42150.75;

/* ₱ amounts — change the locale/currency here if you need another one. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

export default function Dashboard() {
  /* E-wallet style: the amount starts hidden behind the eye toggle. */
  const [hidden, setHidden] = useState(true);

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      <Stack spacing={3}>
        {/* ---- Total balance, e-wallet style ---- */}
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 4,
            p: { xs: 3, sm: 4 },
            /* var(--bg-primary) is light in the light theme and navy in
               the dark theme, so it stays readable on the accent in
               both. */
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
            boxShadow: "var(--glass-shadow)",
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between", position: "relative" }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <BalanceIcon sx={{ fontSize: 18 }} />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 500,
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Total Balance
              </Typography>
            </Stack>
            <Tooltip title={hidden ? "Show amount" : "Hide amount"}>
              <IconButton
                size="small"
                onClick={() => setHidden((prev) => !prev)}
                aria-label={hidden ? "Show amount" : "Hide amount"}
                sx={{ color: "inherit", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.15)" } }}
              >
                {hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          <Typography
            component="p"
            sx={{
              position: "relative",
              mt: 1,
              fontWeight: 700,
              fontSize: { xs: "2.25rem", sm: "2.75rem" },
              lineHeight: 1.15,
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hidden ? "₱ ••••••" : money(STATIC_BALANCE)}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
