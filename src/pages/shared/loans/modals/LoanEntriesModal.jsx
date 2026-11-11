import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  Select,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import ModalComponent from "../../../../components/ui/ModalComponent";
import { RowsSkeleton } from "../../../../components/ui/AppSkeleton";
import { loanService } from "../../../../services/loanService";
import { transactionService } from "../../../../services/transactionService";
import { cardService } from "../../../../services/cardService";
import { computeTransactionStats, currentBalanceOf } from "../../../../lib/kpiStats";
import { cardTitle } from "../../../../lib/cards";
/* Due-date arithmetic lives in one place now — shared with Loans.jsx. */
import { nthDue } from "../../../../lib/loanSchedule";

/* ₱ amounts — keep in sync with Loans.jsx. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/* Render the UTC fields so the stored wall-clock day shows exactly as picked. */
const fmtDay = (d) =>
  d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const dueText = (loan) => {
  const first = nthDue(loan, 0);
  if (!first) return "";
  const step = Math.max(0, (Number(loan.nTerms) || 1) - 1);
  return step === 0 ? fmtDay(first) : `${fmtDay(first)} - ${fmtDay(nthDue(loan, step))}`;
};

/* "YYYY-MM-DD" of the user's local calendar day — due/PAY comparisons use
   this so "today" and the stored wall-clock due days compare like dates. */
const todayStr = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const PERIOD_LABEL = { D: "Daily", W: "Weekly", M: "Monthly", A: "Annual" };

/* tblentries.cStatus: X = pending, P = paid (on the due date),
   L = late payment (paid after the due date), A = advance (paid early). */
const ENTRY_STATUS = {
  X: { label: "Pending", color: "#ed6c02", bg: "rgba(237, 108, 2, 0.14)" },
  P: { label: "Paid", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  L: { label: "Late Payment", color: "#f44336", bg: "rgba(244, 67, 54, 0.14)" },
  A: { label: "Advance Payment", color: "#1976d2", bg: "rgba(25, 118, 210, 0.14)" },
};

const PAY_TOAST = {
  P: "Payment recorded.",
  L: "Late payment recorded.",
  A: "Advance payment recorded.",
  X: "Payment undone — back to Pending.",
};

/* A debit card's spendable figure is the money it holds (dBalance) —
   only debit cards are offered as a payment source. */
const spendableOf = (card) => Number(card?.dBalance) || 0;

/**
 * View a loan's payment schedule (tblentries). Rows are generated when
 * the loan activates. Rows turn red once their due date arrives, and
 * every unpaid row with a date carries an action button matched to the
 * month: missed -> Repay (records L), due THIS month -> PAY (records P),
 * due next month or later -> Advance (records A, blue). Each of those
 * buttons opens the inline "Pay With" chooser (Current Balance or a
 * selected debit card, gated on a sufficient balance) instead of a browser
 * confirm; a CARD payment tells the server (nCardId), which writes a
 * second ledger row beside the Payment one — the card's deduction,
 * visible in the card's View and removed again on Undo. The Pending badge
 * only shows when there is nothing to act on (no date). Settled rows show
 * their badge (Paid / Late Payment / Advance Payment) plus an undo
 * icon button (tooltip "Undo Payment") that sends X (back to Pending),
 * via PUT /api/entries/:id { cStatus }.
 */
export default function LoanEntriesModal({ open, onClose, loan }) {
  const loanId = loan?.nLoanId;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch after PAY
  const [payingId, setPayingId] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  /* PAY chooser: the open row, the picked source ("balance" | "card")
     and the picked card — plus what PAY can draw from (the current
     balance and the cards). */
  const [payOpenId, setPayOpenId] = useState(null);
  const [payWith, setPayWith] = useState("balance");
  const [payCardId, setPayCardId] = useState("");
  const [balance, setBalance] = useState(null);
  const [cards, setCards] = useState([]);

  /* "Current Balance" = the business balance minus the money already
     sitting on the debit cards — see currentBalanceOf. */
  const currentBalance =
    balance == null ? null : currentBalanceOf(balance, cards);

  useEffect(() => {
    if (!open || !loanId) return undefined;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setPayOpenId(null);
      setPayWith("balance");
      setPayCardId("");
      /* The schedule plus what PAY draws from. The chooser's data
         failing must not hide the schedule — only a rejected entries
         load sets `error`. */
      const [entriesRes, balanceRes, cardsRes] = await Promise.allSettled([
        loanService.listEntries(loanId),
        transactionService.list(),
        cardService.list(),
      ]);
      if (!alive) return;
      if (entriesRes.status === "fulfilled") {
        setEntries(entriesRes.value || []);
      } else {
        console.error("Error fetching entries:", entriesRes.reason);
        setEntries([]);
        setError(entriesRes.reason?.message || "Failed to load entries");
      }
      if (balanceRes.status === "fulfilled") {
        setBalance(computeTransactionStats(balanceRes.value || []).balance);
      } else {
        console.error("Error fetching balance for the PAY choices:", balanceRes.reason);
      }
      if (cardsRes.status === "fulfilled") {
        /* Only DEBIT cards may pay — they are the ones holding money
           (dBalance); credit cards are not offered. */
        setCards((cardsRes.value || []).filter((c) => c.cType === "D"));
      } else {
        console.error("Error fetching cards for the PAY choices:", cardsRes.reason);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [open, loanId, version]);

  /* The API half of a status change — shared by the chooser's confirm
     button and Undo's plain browser confirm. `cardId` (settle only) is
     the debit card paying: the server writes the card's deduction row
     beside the Payment row, and the toast names the source. */
  const submitEntryStatus = async (entry, status, cardId = null) => {
    setPayingId(entry.nEntriesId);
    try {
      await loanService.updateEntryStatus(entry.nEntriesId, status, cardId);
      const card = cardId
        ? cards.find((c) => String(c.nCardId) === String(cardId))
        : null;
      setSnack({
        open: true,
        message: card
          ? `${PAY_TOAST[status] || "Payment recorded."} Deducted from ${cardTitle(card)}.`
          : PAY_TOAST[status] || "Payment recorded.",
        severity: "success",
      });
      setPayOpenId(null);
      setVersion((v) => v + 1); // refetch the schedule
    } catch (err) {
      console.error("Entry status error:", err);
      setSnack({
        open: true,
        message: err.message || "Failed to update payment",
        severity: "error",
      });
    } finally {
      setPayingId(null);
    }
  };

  /* Undo (back to Pending) keeps the plain browser confirm — the row
     has no amount source to choose for it. */
  const handleEntryStatus = async (entry, status) => {
    const undo = status === "X";
    const question = undo
      ? "Undo this payment? The entry goes back to Pending."
      : "Record this payment?";
    if (!window.confirm(question)) return;
    await submitEntryStatus(entry, status);
  };

  /* Repay / PAY / Advance open the inline "Pay With" chooser instead of
     confirming — current balance is preselected when it already covers
     the amount, otherwise the card picker. */
  const openPayChooser = (entry) => {
    const amount = Number(entry.dAmount) || 0;
    setPayWith((currentBalance ?? 0) >= amount ? "balance" : "card");
    setPayCardId("");
    setPayOpenId(entry.nEntriesId);
  };

  const total = entries.reduce((sum, e) => sum + (Number(e.dAmount) || 0), 0);

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={loan ? `Entries — ${loan.strCode || `Loan #${loan.nLoanId}`}` : "Entries"}
      type="view"
      maxWidth="sm"
    >
      {loan && (
        <Typography
          variant="caption"
          sx={{ display: "block", mb: 1.5, color: "var(--text-muted)" }}
        >
          {loan.nTerms} {Number(loan.nTerms) === 1 ? "term" : "terms"}
          {PERIOD_LABEL[loan.cInterestType]
            ? ` · ${PERIOD_LABEL[loan.cInterestType]} interest`
            : ""}
          {loan.dttDueDate ? ` · Due ${dueText(loan)}` : ""}
        </Typography>
      )}

      {/* Loading: skeleton rows shaped like the schedule, not a spinner. */}
      {loading && (
        <Stack sx={{ py: 1.5 }}>
          <RowsSkeleton rows={4} />
        </Stack>
      )}

      {!loading && error && (
        <Typography variant="body2" sx={{ color: "#f44336", py: 2, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      {!loading && !error && entries.length === 0 && (
        <Typography
          variant="body2"
          sx={{ color: "var(--text-muted)", py: 2, textAlign: "center" }}
        >
          No entries for this loan yet.
        </Typography>
      )}

      {!loading && !error && entries.length > 0 && (
        <Stack spacing={1}>
          {entries.map((entry, index) => {
            const status = ENTRY_STATUS[entry.cStatus] || {
              label: entry.cStatus || "—",
              color: "var(--text-muted)",
              bg: "transparent",
            };
            const due = nthDue(loan, index);
            /* Settled = paid, late, or advance — all real payments. */
            const paid = ["P", "L", "A"].includes(entry.cStatus);
            const dueDay = due ? due.toISOString().slice(0, 10) : "";
            const today = todayStr();
            /* Red once the due date has arrived (or passed) and is unpaid. */
            const dueReached = !paid && dueDay !== "" && dueDay <= today;
            const unpaid = !paid && dueDay !== "";
            /* Missed entirely (strictly before today) -> Repay. */
            const missed = unpaid && dueDay < today;
            /* Due THIS month (today or later) -> PAY; due next month or
               later -> Advance. The Pending badge only shows when there is
               no date to act on. */
            const dueThisMonth =
              unpaid && !missed && dueDay.slice(0, 7) === today.slice(0, 7);
            const later = unpaid && !missed && !dueThisMonth;
            const button = missed ? "Repay" : dueThisMonth ? "PAY" : later ? "Advance" : "";
            /* Status recorded with that button: late / paid / advance. */
            const payStatus = missed ? "L" : later ? "A" : "P";
            /* Advance gets its own blue to match the Advance Payment badge. */
            const btnColor = button === "Advance" ? "#1976d2" : "#2e7d32";
            /* PAY chooser maths — the picked source must cover this
               term's amount before the payment can go through. */
            const amount = Number(entry.dAmount) || 0;
            const balanceOk = currentBalance != null && currentBalance >= amount;
            const selectedCard = cards.find(
              (c) => String(c.nCardId) === String(payCardId)
            );
            const cardOk =
              Boolean(selectedCard) && spendableOf(selectedCard) >= amount;
            const chooserOpen =
              Boolean(button) && payOpenId === entry.nEntriesId;
            const canPay = payWith === "balance" ? balanceOk : cardOk;
            return (
              <React.Fragment key={entry.nEntriesId}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{
                    alignItems: "center",
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    backgroundColor: dueReached
                      ? "rgba(244, 67, 54, 0.13)"
                      : "var(--overlay-dark)",
                    border: dueReached
                      ? "1px solid rgba(244, 67, 54, 0.35)"
                      : "1px solid transparent",
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: dueReached ? "#f44336" : "var(--text-muted)",
                      fontWeight: dueReached ? 600 : 400,
                      minWidth: 105,
                    }}
                  >
                    {index + 1}. {due ? fmtDay(due) : "—"}
                  </Typography>
                  {/* Status badge directly after the date — rows that still
                      carry an action button (Repay/PAY/Advance) keep their
                      button-only look and show no badge. */}
                  {!button && (
                    <Chip
                      size="small"
                      label={status.label}
                      sx={{
                        flexShrink: 0,
                        bgcolor: status.bg,
                        color: status.color,
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                  )}
                  <Typography
                    variant="body2"
                    sx={{
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      flex: 1,
                      textAlign: "right",
                    }}
                  >
                    {money(entry.dAmount)}
                  </Typography>
                  {button ? (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={payingId === entry.nEntriesId}
                      /* Every action button (Repay / PAY / Advance)
                         toggles the inline "Pay With" chooser. */
                      onClick={() => {
                        if (chooserOpen) {
                          setPayOpenId(null);
                        } else {
                          openPayChooser(entry);
                        }
                      }}
                      sx={{
                        ml: -1,
                        px: 1.25,
                        minWidth: 0,
                        backgroundColor: btnColor,
                        color: "#fff",
                        textTransform: "none",
                        fontWeight: 700,
                        fontSize: "0.72rem",
                        "&:hover": { backgroundColor: btnColor, opacity: 0.9 },
                      }}
                    >
                      {payingId === entry.nEntriesId ? "…" : button}
                    </Button>
                  ) : (
                    paid && (
                      <Tooltip title="Undo Payment">
                        <span>
                          <IconButton
                            size="small"
                            aria-label="Undo Payment"
                            disabled={payingId === entry.nEntriesId}
                            onClick={() => handleEntryStatus(entry, "X")}
                            sx={{
                              flexShrink: 0,
                              color: "var(--text-muted)",
                              "&:hover": {
                                color: "#f44336",
                                backgroundColor: "transparent",
                              },
                            }}
                          >
                            <UndoIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )
                  )}
                </Stack>

                {/* ---- Inline "Pay With" chooser under the action row ---- */}
                {chooserOpen && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.25,
                      px: 1.5,
                      py: 1.25,
                      borderRadius: 2,
                      border: "1px solid var(--border-medium)",
                      backgroundColor: "var(--bg-secondary)",
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
                      Pay With:
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
                            Current Balance
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
                              : `${money(currentBalance)}${
                                  balanceOk ? "" : " · Insufficient"
                                }`}
                          </Typography>
                        </Stack>
                      }
                    />

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{
                        alignItems: { xs: "stretch", sm: "center" },
                      }}
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
                            Cards (Select):
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
                            const ok = spendableOf(card) >= amount;
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

                    {/* The gate: no source covering the amount, no PAY. */}
                    {!canPay && (
                      <Typography variant="caption" sx={{ color: "#f44336" }}>
                        {payWith === "card"
                          ? cards.length === 0
                            ? "No debit cards available — pick Current Balance instead."
                            : "Pick a card with a sufficient balance."
                          : balance == null
                            ? "Current balance unavailable."
                            : `Current balance is not sufficient — ${money(
                                currentBalance
                              )} available for ${money(amount)}.`}
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

                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: "flex-end" }}
                    >
                      <Button
                        size="small"
                        onClick={() => setPayOpenId(null)}
                        sx={{
                          color: "var(--text-muted)",
                          textTransform: "none",
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!canPay || payingId === entry.nEntriesId}
                        onClick={() =>
                          submitEntryStatus(
                            entry,
                            payStatus,
                            /* The card's half is written server-side. */
                            payWith === "card" ? payCardId : null
                          )
                        }
                        sx={{
                          textTransform: "none",
                          fontWeight: 700,
                          backgroundColor: btnColor,
                          "&:hover": {
                            backgroundColor: btnColor,
                            opacity: 0.9,
                          },
                        }}
                      >
                        {payingId === entry.nEntriesId
                          ? "…"
                          : `${button} ${money(amount)}`}
                      </Button>
                    </Stack>
                  </Box>
                )}
              </React.Fragment>
            );
          })}

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
