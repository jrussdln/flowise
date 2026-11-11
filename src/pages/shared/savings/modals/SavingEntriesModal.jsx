import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  SwapHoriz as TransferIcon,
} from "@mui/icons-material";
import ModalComponent from "../../../../components/ui/ModalComponent";
import { RowsSkeleton } from "../../../../components/ui/AppSkeleton";
import { savingService } from "../../../../services/savingService";
import { transactionService } from "../../../../services/transactionService";
import { cardService } from "../../../../services/cardService";
import { computeTransactionStats, currentBalanceOf } from "../../../../lib/kpiStats";
import { cardTitle } from "../../../../lib/cards";

/* ₱ amounts — keep in sync with Savings.jsx / LoanEntriesModal. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/* A debit card's spendable figure is the money it holds (dBalance) —
   only debit cards are offered as a deposit source (same rule the
   loan entries modal uses). */
const spendableOf = (card) => Number(card?.dBalance) || 0;

/**
 * A saving's deposits (tblentries, cType "S") — the savings twin of
 * LoanEntriesModal, minus the payment machinery: every row is already
 * recorded (cStatus "A"), so rows only show an amount and a delete.
 *
 * The footer has two actions:
 *   **Add**             — a plain deposit: POSTs /api/entries
 *                         { cType: "S", ... }, which inserts the deposit
 *                         AND its tbltransactions row (cType "S", title
 *                         "<saving title> - <date added>", description
 *                         "Savings deposit") linked through
 *                         nTransactionId. The form first asks "Deduct
 *                         From:" — Current Balance or a selected DEBIT
 *                         card; a card deposit writes a SECOND ledger
 *                         row (Expense, type E, linked to that card)
 *                         so the card's View shows the deduction,
 *                         while the deposit itself stays a Savings
 *                         row; the source must cover the amount.
 *   **Transfer to Fund** — the same deposit, but the ledger row it writes
 *                         is an INCOME row (cType "I", description
 *                         "Transfer to fund"), so the money lands in
 *                         Income / Expense as Income.
 *
 * Both swap the dialog's content for the same one-field form (Amount).
 * Deleting a row DELETEs /api/entries/:id, which removes the deposit
 * and that transaction together, whatever type it was logged as.
 */
export default function SavingEntriesModal({ open, onClose, saving }) {
  const savingId = saving?.nSavingId;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch after add/delete
  /* null = the deposit list, "deposit" | "transfer" = the one-field
     Amount form — the mode decides which ledger row the POST writes. */
  const [mode, setMode] = useState(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  /* Deduct From (deposit form): the picked source ("balance" |
     "card") and the picked card, plus what the sources hold — the
     current balance and the cards. */
  const [payWith, setPayWith] = useState("balance");
  const [payCardId, setPayCardId] = useState("");
  const [balance, setBalance] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!open || !savingId) return undefined;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setPayWith("balance");
      setPayCardId("");
      /* The deposit list plus what a deposit can be paid from. The
         chooser's data failing must not hide the list — only a
         rejected entries load sets `error`. */
      const [entriesRes, balanceRes, cardsRes] = await Promise.allSettled([
        savingService.listEntries(savingId),
        transactionService.list(),
        cardService.list(),
      ]);
      if (!alive) return;
      if (entriesRes.status === "fulfilled") {
        setEntries(entriesRes.value || []);
      } else {
        console.error("Error fetching savings entries:", entriesRes.reason);
        setEntries([]);
        setError(entriesRes.reason?.message || "Failed to load entries");
      }
      if (balanceRes.status === "fulfilled") {
        setBalance(computeTransactionStats(balanceRes.value || []).balance);
      } else {
        console.error("Error fetching balance for the deposit form:", balanceRes.reason);
      }
      if (cardsRes.status === "fulfilled") {
        /* Only DEBIT cards may pay for a deposit — they are the ones
           holding money (dBalance); credit cards are not offered. */
        setCards((cardsRes.value || []).filter((c) => c.cType === "D"));
      } else {
        console.error("Error fetching cards for the deposit form:", cardsRes.reason);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [open, savingId, version]);

  /* Leaving the dialog always comes back to the list, never the form. */
  const handleClose = () => {
    if (submitting) return;
    setMode(null);
    setAmount("");
    setPayWith("balance");
    setPayCardId("");
    onClose();
  };

  const startForm = (nextMode) => {
    setAmount("");
    setPayWith("balance");
    setPayCardId("");
    setMode(nextMode);
  };

  const cancelForm = () => {
    if (submitting) return;
    setAmount("");
    setPayWith("balance");
    setPayCardId("");
    setMode(null);
  };

  const handleAdd = async () => {
    const isTransfer = mode === "transfer";
    const value = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(value)) {
      setSnack({ open: true, message: "Amount must be a valid number.", severity: "warning" });
      return;
    }
    if (value <= 0) {
      setSnack({ open: true, message: "Amount must be greater than zero.", severity: "warning" });
      return;
    }
    /* The chosen source has to cover the deposit — the same gate the
       loan entries modal applies to its PAY chooser. */
    if (!isTransfer && !canDeduct) {
      setSnack({
        open: true,
        message: "The chosen source does not have enough balance for this deposit.",
        severity: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      await savingService.addEntry(savingId, value, {
        transfer: isTransfer,
        ...(!isTransfer && payWith === "card" && selectedCard
          ? { cardId: selectedCard.nCardId }
          : {}),
      });
      setMode(null);
      setAmount("");
      setSnack({
        open: true,
        message: isTransfer
          ? "Transferred to the fund — logged as Income in Transactions."
          : payWith === "card" && selectedCard
            ? `Deposit added — deducted from ${cardTitle(selectedCard)}.`
            : "Deposit added — deducted from your Current Balance.",
        severity: "success",
      });
      setVersion((v) => v + 1); // refetch the deposit list
    } catch (err) {
      console.error("Add entry error:", err);
      setSnack({ open: true, message: err.message || "Failed to add entry", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry) => {
    const question = "Delete this entry? The transaction created for it will be removed too.";
    if (!window.confirm(question)) return;

    setDeletingId(entry.nEntriesId);
    try {
      await savingService.removeEntry(entry.nEntriesId);
      setSnack({ open: true, message: "Entry deleted.", severity: "success" });
      setVersion((v) => v + 1); // refetch the deposit list
    } catch (err) {
      console.error("Delete entry error:", err);
      setSnack({ open: true, message: err.message || "Failed to delete entry", severity: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* Deduct From maths — the picked source must cover the deposit
     amount (0 until a valid number is typed). "Current Balance" is
     the business balance minus the money already sitting on the
     debit cards — see currentBalanceOf. */
  const enteredAmount = Number(amount);
  const depositValue =
    mode === "deposit" && Number.isFinite(enteredAmount) && enteredAmount > 0
      ? enteredAmount
      : 0;
  const currentBalance =
    balance == null ? null : currentBalanceOf(balance, cards);
  const balanceOk = currentBalance != null && currentBalance >= depositValue;
  const selectedCard = cards.find(
    (c) => String(c.nCardId) === String(payCardId)
  );
  const cardOk =
    Boolean(selectedCard) && spendableOf(selectedCard) >= depositValue;
  const canDeduct = payWith === "balance" ? balanceOk : cardOk;

  const total = entries.reduce((sum, e) => sum + (Number(e.dAmount) || 0), 0);

  return (
    <ModalComponent
      open={open}
      onClose={handleClose}
      title={saving ? `Entries — ${saving.strCode || `Saving #${saving.nSavingId}`}` : "Entries"}
      type="view"
      maxWidth="sm"
      onSave={mode ? handleAdd : undefined}
      saveLabel={
        submitting
          ? "Saving…"
          : mode === "transfer"
            ? "Transfer to fund"
            : "Save deposit"
      }
      saving={Boolean(mode) && submitting}
      /* Deposits stay blocked while the picked source can't cover the
         amount — the red note in the panel says why. */
      saveDisabled={mode === "deposit" && !canDeduct}
      onCancel={mode ? cancelForm : undefined}
      actions={
        mode ? undefined : (
          <Stack direction="row" spacing={0.25}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => startForm("deposit")}
              disabled={loading}
              sx={{
                color: "var(--accent)",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8rem",
                px: 1,
                whiteSpace: "nowrap",
                "&:hover": { backgroundColor: "rgba(0, 131, 143, 0.12)" },
              }}
            >
              Add
            </Button>
            <Button
              size="small"
              startIcon={<TransferIcon />}
              onClick={() => startForm("transfer")}
              disabled={loading}
              sx={{
                color: "#2e7d32",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8rem",
                px: 1,
                whiteSpace: "nowrap",
                "&:hover": { backgroundColor: "rgba(46, 125, 50, 0.12)" },
              }}
            >
              Transfer to Fund
            </Button>
          </Stack>
        )
      }
    >
      {saving && !mode && (
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 1.5, color: "var(--text-muted)" }}
        >
          {saving.strTitle || "Untitled saving"}
          {saving.strDescription ? ` · ${saving.strDescription}` : ""}
          {` · ${entries.length} ${entries.length === 1 ? "deposit" : "deposits"} · ${money(total)}`}
        </Typography>
      )}

      {/* ---- Add form: shown in the modal content when Add or
               Transfer to Fund is pressed ---- */}
      {mode && (
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={mode === "transfer" ? "Amount to transfer" : "Amount"}
            type="number"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="0.00"
            inputProps={{ min: 0, step: "0.01" }}
            sx={{
              "& .MuiOutlinedInput-root": {
                color: "var(--text-primary)",
                "& fieldset": { borderColor: "var(--border-medium)" },
                "&:hover fieldset": { borderColor: "var(--accent)" },
                "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
              },
              "& .MuiInputLabel-root": { color: "var(--text-muted)" },
            }}
          />

          {/* ---- Deduct From (deposits only): the source the amount
                   leaves from — Current Balance or a card; the source
                   must cover the amount. ---- */}
          {mode === "deposit" && (
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
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Deduct From:
              </Typography>

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
                      {balance == null
                        ? "…"
                        : `${money(currentBalance)}${balanceOk ? "" : " · Insufficient"}`}
                    </Typography>
                  </Stack>
                }
              />

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { xs: "stretch", sm: "center" } }}
              >
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
                        color:
                          cards.length > 0
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      Card Selection:
                    </Typography>
                  }
                />
                <Select
                  size="small"
                  value={payCardId}
                  displayEmpty
                  disabled={payWith !== "card" || cards.length === 0}
                  onChange={(e) => setPayCardId(e.target.value)}
                  renderValue={(v) => {
                    const card = cards.find(
                      (c) => String(c.nCardId) === String(v)
                    );
                    return card
                      ? `${cardTitle(card)} · ${money(spendableOf(card))}`
                      : "Select a card";
                  }}
                  sx={{ minWidth: { xs: "auto", sm: 230 } }}
                >
                  {cards.length === 0 ? (
                    <MenuItem disabled>No debit cards yet</MenuItem>
                  ) : (
                    cards.map((card) => {
                      const ok = spendableOf(card) >= depositValue;
                      return (
                        <MenuItem
                          key={card.nCardId}
                          value={String(card.nCardId)}
                          disabled={!ok}
                        >
                          {cardTitle(card)} · {money(spendableOf(card))}
                          {!ok && " — Insufficient"}
                        </MenuItem>
                      );
                    })
                  )}
                </Select>
              </Stack>

              {/* The gate: no source covering the amount, no save. */}
              {!canDeduct && (
                <Typography variant="caption" sx={{ color: "#f44336" }}>
                  {payWith === "card"
                    ? cards.length === 0
                      ? "No debit cards available — pick Current Balance instead."
                      : "Pick a card with a sufficient balance."
                    : balance == null
                      ? "Current balance unavailable."
                      : `Current balance is not sufficient — ${money(
                          currentBalance
                        )} available for ${money(depositValue)}.`}
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
          )}

          <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)" }}>
            {mode === "transfer" ? (
              <>
                Adds a <strong>Deposit</strong> entry to this saving and records it as{" "}
                <strong>Income</strong> (type I) in Transactions.
              </>
            ) : (
              <>
                Adds a <strong>Deposit</strong> entry (type S) to this saving and a matching{" "}
                <strong>Savings</strong> transaction in Transactions — deducted from the source
                picked above; paying with a card also records the deduction as an{" "}
                <strong>Expense</strong> row on that card.
              </>
            )}
          </Typography>
        </Stack>
      )}

      {/* ---- Deposit list ---- */}
      {/* Loading: skeleton rows shaped like the deposit list, not a
          spinner (the Add / delete button keeps its own spinner). */}
      {!mode && loading && (
        <Stack sx={{ py: 1.5 }}>
          <RowsSkeleton rows={4} />
        </Stack>
      )}

      {!mode && !loading && error && (
        <Typography variant="body2" sx={{ color: "#f44336", py: 2, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      {!mode && !loading && !error && entries.length === 0 && (
        <Typography
          variant="body2"
          sx={{ color: "var(--text-muted)", py: 2, textAlign: "center" }}
        >
          No deposits yet — press <strong>Add</strong> to record one, or{" "}
          <strong>Transfer to Fund</strong> to log it as income.
        </Typography>
      )}

      {!mode && !loading && !error && entries.length > 0 && (
        <Stack spacing={1}>
          {entries.map((entry, index) => (
            <Stack
              key={entry.nEntriesId}
              direction="row"
              spacing={2}
              sx={{
                alignItems: "center",
                px: 1.5,
                py: 1,
                borderRadius: 2,
                backgroundColor: "var(--overlay-dark)",
              }}
            >
              <Typography variant="body2" sx={{ color: "var(--text-muted)", minWidth: 34 }}>
                {index + 1}.
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "var(--text-primary)", fontWeight: 600, flex: 1 }}
              >
                {money(entry.dAmount)}
              </Typography>
              <Tooltip title="Delete entry">
                <span>
                  <IconButton
                    size="small"
                    disabled={deletingId === entry.nEntriesId}
                    onClick={() => handleDelete(entry)}
                  >
                    {deletingId === entry.nEntriesId ? (
                      <CircularProgress size={16} />
                    ) : (
                      <DeleteIcon fontSize="small" sx={{ color: "#f44336" }} />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ))}

          <Stack direction="row" sx={{ px: 1.5, pt: 1, justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "var(--text-primary)" }}>
              Total
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: "var(--accent)" }}>
              {money(total)}
            </Typography>
          </Stack>
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
