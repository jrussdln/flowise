import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Radio,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Payments as PayWithIcon } from "@mui/icons-material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import { transactionService } from "../../../../../services/transactionService";
import { cardService } from "../../../../../services/cardService";
import { computeTransactionStats, currentBalanceOf } from "../../../../../lib/kpiStats";
import { cardTitle } from "../../../../../lib/cards";

/* ₱ amounts — keep in sync with BudgetPlans.jsx. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/* A debit card's spendable figure is the money it holds (dBalance) —
   only debit cards may fund a plan (same rule the loan entries modal
   uses). */
const spendableOf = (card) => Number(card?.dBalance) || 0;

/**
 * The "Used Plan" dialog — the money step of using a budget plan.
 *
 * Using a plan turns its line items into expenses in Transactions, so
 * the plan's total (the sum of its entries) has to be covered first.
 * The panel below is the same "Pay With" chooser the savings deposit
 * form uses:
 *   **Current Balance** — the ledger balance minus the money already
 *   sitting on the user's debit cards (what is left to spend outside
 *   them). It is marked *Insufficient* when it does not cover the plan.
 *   **Cards (Select)** — the user's debit cards and what each of them
 *   holds; a card that cannot cover the plan is not pickable, and the
 *   note asks for one with a sufficient balance.
 *
 * The ✓ button stays disabled until the chosen source covers the plan's
 * total, and the red note says why it cannot go through.
 */
export default function BudgetPlanUsedPlanModal({ open, onClose, plan, onConfirm }) {
  const [balance, setBalance] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /* The picked source: "balance" (the current balance) or "card" (the
     debit card picked below). */
  const [payWith, setPayWith] = useState("balance");
  const [cardId, setCardId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });

  /* The plan's total — what has to be covered. */
  const needed = Number(plan?.dTotal) || 0;

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setPayWith("balance");
      setCardId("");
      try {
        const [transactions, cardRows] = await Promise.all([
          transactionService.list(),
          cardService.list(),
        ]);
        if (!alive) return;
        setBalance(computeTransactionStats(transactions || []).balance);
        /* Only DEBIT cards may fund a plan — they are the ones holding
           money (credit cards hold no balance). */
        setCards((cardRows || []).filter((c) => c.cType === "D"));
      } catch (err) {
        console.error("Error loading the balance for the plan:", err);
        if (!alive) return;
        setError(err?.message || "Couldn't load your balance");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open]);

  /* Current Balance = the ledger balance minus the money held on the
     debit cards (see currentBalanceOf in src/lib/kpiStats.js). */
  const currentBalance = balance == null ? null : currentBalanceOf(balance, cards);
  const balanceOk = currentBalance != null && currentBalance >= needed;
  const selectedCard = cards.find((c) => String(c.nCardId) === String(cardId));
  const cardOk = Boolean(selectedCard) && spendableOf(selectedCard) >= needed;
  const canPay = needed <= 0 || (payWith === "balance" ? balanceOk : cardOk);

  const handleConfirm = async () => {
    if (!canPay) return;

    setSubmitting(true);
    try {
      await onConfirm({
        payWith,
        cardId: payWith === "card" && selectedCard ? selectedCard.nCardId : null,
      });
      setSnack({ open: true, message: "Plan used — its entries are now expenses.", severity: "success" });
    } catch (err) {
      console.error("Use plan error:", err);
      setSnack({ open: true, message: err.message || "Failed to use the plan", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      color: "var(--text-primary)",
      backgroundColor: "var(--bg-primary)",
      "& fieldset": { borderColor: "var(--border-medium)" },
      "&:hover fieldset": { borderColor: "var(--accent)" },
      "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
    },
    "& .MuiInputLabel-root": { color: "var(--text-muted)" },
  };

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={plan ? `Use plan — ${plan.strCode || `Plan #${plan.nBudgetPlanId}`}` : "Use plan"}
      type="edit"
      maxWidth="sm"
      onSave={handleConfirm}
      saveLabel={submitting ? "Saving…" : "Use plan"}
      saving={submitting}
      saveDisabled={!canPay}
    >
      {loading ? (
        <Stack sx={{ alignItems: "center", py: 3 }}>
          <CircularProgress size={22} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {/* What the plan costs. */}
          <Box
            sx={{
              px: 1.5,
              py: 1.25,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              backgroundColor: "var(--overlay-dark)",
            }}
          >
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography variant="body2" sx={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {plan?.strTitle || "Untitled budget plan"}
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--accent)", fontWeight: 700 }}>
                {money(needed)}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
              {plan?.nEntries || 0} {plan?.nEntries === 1 ? "entry" : "entries"} will be added
              to Transactions as expenses
            </Typography>
          </Box>

          {error && (
            <Typography variant="caption" sx={{ color: "#f44336" }}>
              {error}
            </Typography>
          )}

          {/* ---- Pay With: where the money comes from ---- */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              px: 1.25,
              py: 1.25,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              backgroundColor: "var(--overlay-dark)",
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <PayWithIcon sx={{ color: "var(--accent)", fontSize: 16 }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Pay With:
              </Typography>
            </Stack>

            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Radio
                  size="small"
                  checked={payWith === "balance"}
                  onChange={() => setPayWith("balance")}
                />
              }
              label={
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "baseline", flexWrap: "wrap" }}
                >
                  <Typography
                    variant="body2"
                    sx={{ color: "var(--text-primary)", fontWeight: 500 }}
                  >
                    Current Balance:
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: balanceOk ? "var(--text-muted)" : "#f44336",
                      fontWeight: balanceOk ? 400 : 700,
                    }}
                  >
                    {currentBalance == null
                      ? "…"
                      : `${money(currentBalance)}${balanceOk ? "" : " · Insufficient"}`}
                  </Typography>
                </Stack>
              }
            />

            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Radio
                  size="small"
                  checked={payWith === "card"}
                  onChange={() => setPayWith("card")}
                  disabled={cards.length === 0}
                />
              }
              label={
                <Typography
                  variant="body2"
                  sx={{
                    color: cards.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: 500,
                  }}
                >
                  Cards (Select):
                </Typography>
              }
            />

            <TextField
              select
              size="small"
              label="Card"
              value={cardId}
              disabled={payWith !== "card" || cards.length === 0}
              onChange={(e) => setCardId(e.target.value)}
              sx={fieldSx}
              slotProps={{
                select: {
                  MenuProps: {
                    slotProps: { paper: { sx: { maxHeight: 300 } } },
                  },
                },
              }}
            >
              {cards.length === 0 ? (
                <MenuItem disabled>No debit cards yet</MenuItem>
              ) : (
                cards.map((card) => {
                  const ok = spendableOf(card) >= needed;
                  return (
                    <MenuItem key={card.nCardId} value={String(card.nCardId)} disabled={!ok}>
                      {cardTitle(card)} · {money(spendableOf(card))}
                      {!ok && " — Insufficient"}
                    </MenuItem>
                  );
                })
              )}
            </TextField>

            {/* The gate: the chosen source must cover the plan. */}
            {payWith === "card" && !cardOk && (
              <Typography variant="caption" sx={{ color: "#f44336" }}>
                {cards.length === 0
                  ? "No debit cards available — pick Current Balance instead."
                  : "Pick a card with a sufficient balance."}
              </Typography>
            )}
            {payWith === "balance" && !balanceOk && (
              <Typography variant="caption" sx={{ color: "#f44336" }}>
                {currentBalance == null
                  ? "Current balance unavailable."
                  : `Current balance is not sufficient — ${money(currentBalance)} available for ${money(needed)}.`}
              </Typography>
            )}

            {/* Makes the formula behind the figure explicit. */}
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              Current Balance = Total Balance − balances held on your debit cards.
            </Typography>
          </Box>
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </ModalComponent>
  );
}
