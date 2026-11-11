import { Box, Stack, Typography } from "@mui/material";
import { cardColor } from "../../lib/cards";

/* ₱ amounts — keep in sync with the pages. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/**
 * Physical debit/credit-card face, shared by the Dashboard's Cards
 * strip and the Cards page: the card's colour (strColor, see
 * src/lib/cards.js) painted as a darkened gradient so white text stays
 * readable, an EMV chip, the masked number and the balance/valid-thru
 * footer.
 *
 * Fixed width by default (the horizontal strip); pass `sx` to reshape
 * it — the Cards page's grid passes width: "100%" to stretch the face
 * across its cell.
 */
export default function BankCardFace({ card, sx }) {
  const accent = cardColor(card) || "#4a6b8a";
  const credit = card.cType === "C";
  const tail = String(card.strAccountNumber || "").replace(/\s+/g, "").slice(-4);
  const number = `•••• •••• •••• ${tail || "••••"}`;
  const balance = credit ? card.dOutstanding : card.dBalance;

  return (
    <Box
      sx={[
        {
          width: { xs: 236, sm: 268 },
          minHeight: 150,
          p: 2.25,
          borderRadius: "18px",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          color: "#ffffff",
          /* Accent darkened against black/navy — keeps each card's hue
             while white text stays readable on every colour. */
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 65%, #000) 0%, color-mix(in srgb, ${accent} 28%, #0a1628) 100%)`,
          boxShadow: "var(--glass-shadow)",
        },
        sx,
      ]}
    >
      {/* Soft shine across the top-right corner. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 85% -20%, rgba(255,255,255,0.28), transparent 55%)",
          pointerEvents: "none",
        }}
      />

      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", position: "relative", minWidth: 0 }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.strBankName || "Untitled card"}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            ml: 1,
            px: 0.75,
            py: 0.15,
            border: "1px solid rgba(255, 255, 255, 0.5)",
            borderRadius: 2,
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {credit ? "CREDIT" : "DEBIT"}
        </Typography>
      </Stack>

      {/* EMV chip. */}
      <Box
        sx={{
          width: 36,
          height: 24,
          borderRadius: "6px",
          position: "relative",
          background: "linear-gradient(135deg, #f7e08c 0%, #c9a227 100%)",
          boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.18)",
        }}
      />

      <Typography
        sx={{
          position: "relative",
          fontFamily: "monospace",
          fontSize: "0.95rem",
          letterSpacing: "0.14em",
        }}
      >
        {number}
      </Typography>

      <Stack
        direction="row"
        sx={{ alignItems: "flex-end", justifyContent: "space-between", mt: "auto", position: "relative" }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
            {credit ? "OUTSTANDING" : "BALANCE"}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.2 }}>
            {money(balance)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography variant="caption" sx={{ display: "block", opacity: 0.75 }}>
            VALID THRU
          </Typography>
          <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", fontFamily: "monospace" }}>
            {card.strExpiry || "—"}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
