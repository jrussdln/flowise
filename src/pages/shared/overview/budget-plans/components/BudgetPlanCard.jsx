/* ------------------------------------------------------------------
   One budget-plan card — the grid tile on the Budget Plans page.

   Shaped like the Savings card (code + status chip + corner actions,
   uppercase title, description, created date and a status badge in the
   bottom-right), minus the money: a budget plan holds no amount, so
   there is no balance to show and no deposits to unlock.

   The upper-right holds ONE row of icons: Edit, then Delete, then the
   favourite star closing the row on the right. The status toggle rides
   as a pill badge on the bottom row, right next to the created date
   (Pending -> Activate, Active -> Complete, Completed -> Activate
   again). Cosmetics: `strColor` paints an accent bar (and the code),
   and the star pins the card to the top of the grid.
   ------------------------------------------------------------------ */

import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import {
  CheckCircle as ActivateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  PlaylistAddCheck as UsePlanIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import { cardColor, isFavorite } from "../../../../../lib/cards";

/* ₱ amounts — keep in sync with BudgetPlans.jsx. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/* tblbudgetplan.cStatus — a plan is Active while it is being planned
   and used ("C") once its entries have been posted to the ledger as
   expenses. */
const STATUS_META = {
  P: { label: "Pending", color: "#ed6c02", bg: "rgba(237, 108, 2, 0.14)" },
  A: { label: "Active", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  C: { label: "Used", color: "#1565c0", bg: "rgba(21, 101, 192, 0.14)" },
};

const glassCard = {
  borderRadius: 3,
  backgroundColor: "var(--glass-bg-strong)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-medium)",
  boxShadow: "var(--glass-shadow)",
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

/** label / value row inside the card ("Created Oct 2, 2026"). */
function MetaRow({ label, value }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "var(--text-primary)", fontWeight: 600 }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export default function BudgetPlanCard({
  plan,
  onUse,
  onActivate,
  onView,
  onEdit,
  onDelete,
  onToggleFavorite,
}) {
  /* A plan is Active while it is being planned; "C" means it has been
     USED — its entries are posted to the ledger as expenses. */
  const status = STATUS_META[plan.cStatus] || STATUS_META.A;
  /* strColor (a colour code — see src/lib/cards.js) -> accent bar down
     the card's left edge + the code beside the status chip. */
  const accent = cardColor(plan);
  const favorite = isFavorite(plan);
  /* dBudgetAmount is optional — a plan without one falls back to the
     sum of its entries as the headline figure. */
  const hasBudget = plan.dBudgetAmount !== null && plan.dBudgetAmount !== undefined;
  /* Action badge on the footer date row: an Active plan offers "Used
     Plan" (posts its entries to the ledger as expenses), a used plan
     offers "Activate" (takes those expenses back out). */
  const badge =
    plan.cStatus === "C"
      ? {
          label: "Activate",
          color: "#2e7d32",
          icon: <ActivateIcon />,
          onClick: () => onActivate(plan),
        }
      : {
          label: "Used Plan",
          color: "#1565c0",
          icon: <UsePlanIcon />,
          onClick: () => onUse(plan),
        };

  return (
    <Paper
      elevation={0}
      sx={{
        ...glassCard,
        p: 2.5,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        /* Overrides glassCard's 1px left border with the card's colour. */
        ...(accent ? { borderLeft: `4px solid ${accent}` } : {}),
      }}
    >
      {/* Header: code + status chip on the left, the icon actions on the
          top-right. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            flexWrap: "wrap",
            rowGap: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: accent || "var(--text-muted)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {plan.strCode || `Plan #${plan.nBudgetPlanId}`}
          </Typography>
          <Chip
            size="small"
            label={status.label}
            sx={{
              bgcolor: status.bg,
              color: status.color,
              fontWeight: 600,
              fontSize: "0.72rem",
            }}
          />
        </Stack>

        {/* ONE row of icons: View / Edit / Delete on the LEFT, the
            favourite star closing it on the right. */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          <Tooltip title="View entries">
            <IconButton size="small" aria-label="View entries" onClick={() => onView(plan)}>
              <ViewIcon fontSize="small" sx={{ color: "var(--accent)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" aria-label="Edit" onClick={() => onEdit(plan)}>
              <EditIcon fontSize="small" sx={{ color: "var(--accent)" }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" aria-label="Delete" onClick={() => onDelete(plan)}>
              <DeleteIcon fontSize="small" sx={{ color: "#f44336" }} />
            </IconButton>
          </Tooltip>
          {/* Favourite toggle — available on every card (pinning is only
              cosmetic, so it never locks). */}
          <Tooltip title={favorite ? "Remove from favourites" : "Add to favourites"}>
            <IconButton size="small" onClick={() => onToggleFavorite(plan)} sx={{ p: 0.5 }}>
              {favorite ? (
                <StarIcon sx={{ fontSize: 18, color: "#f9a825" }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: 18, color: "var(--text-muted)" }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Stack>

      {/* Upper-case title — kept close to the code above it, the same
          shape the Savings cards use. */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 400,
          fontSize: "0.9rem",
          color: "var(--text-primary)",
          mt: 1,
          lineHeight: 1.35,
          textTransform: "uppercase",
        }}
      >
        {plan.strTitle || "Untitled budget plan"}
      </Typography>

      {/* What the plan adds up to. With a budget amount set, that amount
          is the headline and the entries' sum rides under it; without
          one, the entries' sum is the headline. */}
      <Typography
        sx={{
          fontSize: "1.125rem",
          lineHeight: 1.4,
          fontWeight: 700,
          color: "var(--accent)",
          mt: 0.25,
        }}
      >
        {hasBudget ? money(plan.dBudgetAmount) : money(plan.dTotal)}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: "var(--text-muted)", display: "block", mb: 0.5 }}
      >
        {hasBudget
          ? `${money(plan.dTotal)} planned · ${plan.nEntries || 0} ${
              plan.nEntries === 1 ? "entry" : "entries"
            }`
          : `${plan.nEntries || 0} ${plan.nEntries === 1 ? "entry" : "entries"} · no budget amount set`}
      </Typography>

      {plan.strDescription ? (
        <Typography
          variant="body2"
          sx={{
            color: "var(--text-muted)",
            mt: 0.5,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {plan.strDescription}
        </Typography>
      ) : (
        <Typography
          variant="body2"
          sx={{ color: "var(--text-muted)", mt: 0.5, fontStyle: "italic" }}
        >
          No description yet.
        </Typography>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {/* Footer: the created date with the status toggle pinned bottom-right. */}
      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MetaRow label="Created" value={formatDate(plan.dttCreated)} />
        </Box>
        {badge && (
          <Button
            size="small"
            variant="contained"
            startIcon={badge.icon}
            onClick={badge.onClick}
            sx={{
              minWidth: 0,
              flexShrink: 0,
              borderRadius: "999px",
              px: 1.4,
              py: 0.1,
              lineHeight: 1.6,
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "none",
              backgroundColor: badge.color,
              color: "#fff",
              boxShadow: "none",
              "& .MuiButton-startIcon": { mr: 0.5, "& svg": { fontSize: "0.9rem" } },
              "&:hover": { backgroundColor: badge.color, opacity: 0.9, boxShadow: "none" },
            }}
          >
            {badge.label}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
