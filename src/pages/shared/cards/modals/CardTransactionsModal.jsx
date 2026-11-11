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
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AccountBalanceWallet as BalanceIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import UndoIcon from "@mui/icons-material/Undo";
import ModalComponent from "../../../../components/ui/ModalComponent";
import { RowsSkeleton } from "../../../../components/ui/AppSkeleton";
import { cardService } from "../../../../services/cardService";
import { loanService } from "../../../../services/loanService";
import { transactionService } from "../../../../services/transactionService";
import { computeTransactionStats, currentBalanceOf } from "../../../../lib/kpiStats";
import { cardCode, cardTitle, isCredit, maskAccountNumber, purchaseDueDate } from "../../../../lib/cards";

/* ₱ amounts — keep in sync with Cards.jsx / SavingEntriesModal. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

/* Render the UTC fields so the billing day shows exactly as computed. */
const fmtDay = (d) =>
  d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/* "YYYY-MM-DD" of the user's local calendar day — due/PAY comparisons
   use this so "today" and the computed due days compare like dates. */
const todayStr = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/* Money in on a card = Income rows and REPAYMENTS (P rows linked to a
 *  card: a credit-card purchase being paid off — the row's amount lands
 *  back on the card, cancelling its Purchase charge). Everything else
 *  linked to a card (Expense — including a deposit / installment /
 *  repayment paid FROM the card —, Purchase, Savings) is money out and
 *  is shown with a negative amount — the same split the balance is
 *  built from on the server. Loan Payment rows carry no card link, so
 *  the only P rows here are repayments. */
const isMoneyIn = (t) => t.cType === "I" || t.cType === "P";

/* tblentries.cStatus of a repayment: P = paid on time, L = late, A =
   advance (paid before the billing due date) — the loans vocabulary. */
const ENTRY_STATUS = {
  P: { label: "Paid", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  L: { label: "Late Payment", color: "#f44336", bg: "rgba(244, 67, 54, 0.14)" },
  A: { label: "Advance Payment", color: "#1976d2", bg: "rgba(25, 118, 210, 0.14)" },
};

const PAY_TOAST = {
  P: "Payment recorded.",
  L: "Late payment recorded.",
  A: "Advance payment recorded.",
  X: "Payment undone — the purchase is unpaid again.",
};

/* A debit card's spendable figure is the money it holds (dBalance) —
   only debit cards are offered as a payment source. */
const spendableOf = (card) => Number(card?.dBalance) || 0;

/**
 * Read-only view of the transactions charged to one card
 * (GET /api/cards/:id/transactions — rows carrying tbltransactions.
 * nCardId = this card). Leads with the Dashboard's balance panel,
 * scoped to the card: what it holds (debit) or the credit limit minus
 * what is still owed on it (credit), with the same eye toggle; below
 * it the logs — title over date/description and a signed amount, no
 * type chips (the sign already says which way the money went). Income
 * (I) rows are money in; Purchases (B) and card-linked Expenses (E)
 * are money out — the rows themselves are created/edited in the
 * Income/Expense tab, so this dialog only lists them.
 *
 * CREDIT cards additionally give every Purchase row a billing lifecycle
 * (the card's nDueDay is the day of the month the bill falls due — an
 * October purchase is billed in November on that day): unpaid purchases
 * carry a Repay (missed) / PAY (due this month) / Advance (due later)
 * button that opens the same inline "Pay With" chooser the loans modal
 * uses (Current Balance or a DEBIT card, gated on a sufficient amount).
 * Paying writes a Payment row linked to this card (shown below as money
 * in) plus a repayment entry (tblentries cType "C") — first payment via
 * POST, re-payment after an undo via PUT. Settled purchases show a
 * badge (Paid / Late Payment / Advance Payment) and an Undo icon; an
 * unpaid purchase past its due day tints red, like the loan schedule.
 * The repayment's own Payment row (P linked to this card) stays OFF
 * the log — the Purchase row carries the whole lifecycle, a second
 * line would show the same payment twice — but it still counts in the
 * balance panel and the in/out totals.
 */
export default function CardTransactionsModal({ open, onClose, card }) {
  const cardId = card?.nCardId;
  const credit = isCredit(card);
  const [transactions, setTransactions] = useState([]);
  const [entries, setEntries] = useState([]); // repayment entries (credit only)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /* Eye toggle on the balance panel — same as the Dashboard's card. */
  const [hidden, setHidden] = useState(false);
  const [version, setVersion] = useState(0); // bump to refetch after pay/undo
  const [payingId, setPayingId] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  /* "Pay With" chooser: the open purchase, the picked source
     ("balance" | "card") and the picked card — plus what PAY can draw
     from (the current balance and the debit cards). */
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
    if (!open || !cardId) return undefined;

    let alive = true;
    setHidden(false);
    setPayOpenId(null);
    setPayWith("balance");
    setPayCardId("");
    (async () => {
      setLoading(true);
      setError("");
      /* The logs plus (credit only) the repayment entries and what PAY
         draws from. A chooser-data failure must not hide the logs —
         only a rejected transactions load sets `error`. */
      const [txnRes, entriesRes, balanceRes, cardsRes] = await Promise.allSettled(
        credit
          ? [
              cardService.listTransactions(cardId),
              loanService.listCardEntries(cardId),
              transactionService.list(),
              cardService.list(),
            ]
          : [cardService.listTransactions(cardId)]
      );
      if (!alive) return;
      if (txnRes.status === "fulfilled") {
        setTransactions(txnRes.value);
      } else {
        console.error("Error fetching card transactions:", txnRes.reason);
        setTransactions([]);
        setError(txnRes.reason?.message || "Failed to load transactions");
      }
      if (entriesRes?.status === "fulfilled") {
        setEntries(entriesRes.value || []);
      } else if (entriesRes) {
        console.error("Error fetching repayments:", entriesRes.reason);
        setEntries([]);
      }
      if (balanceRes?.status === "fulfilled") {
        setBalance(computeTransactionStats(balanceRes.value || []).balance);
      } else if (balanceRes) {
        console.error("Error fetching balance for the PAY choices:", balanceRes.reason);
      }
      if (cardsRes?.status === "fulfilled") {
        /* Only DEBIT cards may pay — they are the ones holding money
           (dBalance); credit cards are not offered. */
        setCards((cardsRes.value || []).filter((c) => c.cType === "D"));
      } else if (cardsRes) {
        console.error("Error fetching cards for the PAY choices:", cardsRes.reason);
      }
      if (!alive) return;
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [open, cardId, credit, version]);

  /* Repayment entries keyed by the Purchase they settle. */
  const entryByPurchase = new Map(
    entries.map((e) => [Number(e.nReferenceId), e])
  );

  /* Money in / money out — the same split the balance is built from. */
  const income = transactions
    .filter(isMoneyIn)
    .reduce((sum, t) => sum + (Number(t.dAmount) || 0), 0);
  const expense = transactions
    .filter((t) => !isMoneyIn(t))
    .reduce((sum, t) => sum + (Number(t.dAmount) || 0), 0);
  /* The headline figure — the Dashboard's balance card, scoped to this
     card: debit shows what it holds; credit shows the limit minus the
     charges still owed (charges minus the repayments landing back on
     the card). */
  const total = credit
    ? (Number(card?.dCreditLimit) || 0) - (expense - income)
    : Number(card?.dBalance) || 0;

  /* The log itself: a repayment's own Payment row (P linked to this
     card) is NOT listed — the Purchase it settles already carries the
     badge and Undo, so a second line would show the same payment
     twice. Repayments still count in the figures above (money back on
     the card) and in the in/out totals. */
  const visible = transactions.filter(
    (t) => !(t.cType === "P" && t.nCardId != null)
  );

  /* The API half of a repayment — shared by the chooser's confirm
      button and Undo's plain browser confirm. An entry that exists (an
      undone payment left it pending) is re-paid through PUT; a first
      payment creates it through POST. `cardId` (settle only) is the
      debit card funding the payment: the server writes the card's
      deduction row beside the Payment row, and the toast names it. */
  const submitPayment = async (transaction, status, cardId = null) => {
    setPayingId(transaction.nTransactionId);
    try {
      const entry = entryByPurchase.get(Number(transaction.nTransactionId));
      if (entry) {
        await loanService.updateEntryStatus(entry.nEntriesId, status, cardId);
      } else {
        await loanService.createCardEntry({
          purchaseId: transaction.nTransactionId,
          cStatus: status,
          nCardId: cardId,
        });
      }
      const source = cardId
        ? cards.find((c) => String(c.nCardId) === String(cardId))
        : null;
      setSnack({
        open: true,
        message: source
          ? `${PAY_TOAST[status] || "Payment recorded."} Deducted from ${cardTitle(source)}.`
          : PAY_TOAST[status] || "Payment recorded.",
        severity: "success",
      });
      setPayOpenId(null);
      setVersion((v) => v + 1); // refetch the logs + repayments + balances
    } catch (err) {
      console.error("Card repayment error:", err);
      setSnack({
        open: true,
        message: err.message || "Failed to record payment",
        severity: "error",
      });
    } finally {
      setPayingId(null);
    }
  };

  /* Undo (back to unpaid) keeps the plain browser confirm — the row
     has no amount source to choose for it. */
  const handleUndo = async (transaction) => {
    if (!window.confirm("Undo this payment? The purchase goes back to unpaid."))
      return;
    await submitPayment(transaction, "X");
  };

  /* Repay / PAY / Advance open the inline "Pay With" chooser instead of
     confirming — current balance is preselected when it already covers
     the amount, otherwise the card picker. */
  const openPayChooser = (transaction) => {
    const amount = Number(transaction.dAmount) || 0;
    setPayWith((currentBalance ?? 0) >= amount ? "balance" : "card");
    setPayCardId("");
    setPayOpenId(transaction.nTransactionId);
  };

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={card ? `Transactions — ${cardCode(card)}` : "Transactions"}
      type="view"
      maxWidth="sm"
    >
      {card && (
        <>
          {/* Total balance, e-wallet style — the same panel the
              Dashboard leads with, scoped to this card. */}
          <Box
            sx={{
              position: "relative",
              overflow: "hidden",
              borderRadius: 4,
              p: { xs: 2.5, sm: 3 },
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              boxShadow: "var(--glass-shadow)",
            }}
          >
            {/* Decorative bubbles behind the content. */}
            <Box
              sx={{
                position: "absolute",
                top: -50,
                right: -40,
                width: 170,
                height: 170,
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.12)",
              }}
            />
            <Box
              sx={{
                position: "absolute",
                bottom: -70,
                right: 110,
                width: 130,
                height: 130,
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            />

            <Stack
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between", position: "relative" }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <BalanceIcon sx={{ fontSize: 20 }} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: "0.1em",
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
                  {hidden ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            </Stack>

            <Typography
              component="p"
              sx={{
                position: "relative",
                mt: 1,
                fontWeight: 700,
                fontSize: { xs: "2rem", sm: "2.25rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {loading ? (
                <Skeleton sx={{ bgcolor: "rgba(255,255,255,0.25)", width: 180, height: 44 }} />
              ) : hidden ? (
                "₱ ••••••"
              ) : (
                money(total)
              )}
            </Typography>
            <Typography variant="caption" sx={{ position: "relative", display: "block", opacity: 0.8 }}>
              {credit ? "Credit limit minus what is still owed" : "What this card holds"}
            </Typography>
          </Box>

          {/* Slim log summary under the panel. */}
          <Typography
            variant="caption"
            sx={{ color: "var(--text-muted)", display: "block", mt: 1.25, mb: 1.5 }}
          >
            {card.strAccountNumber ? `${maskAccountNumber(card.strAccountNumber)} · ` : ""}
            {visible.length} transaction{visible.length === 1 ? "" : "s"} ·{" "}
            {money(income)} in · {money(expense)} out
          </Typography>
        </>
      )}

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

      {!loading && !error && visible.length === 0 && (
        <Typography
          variant="body2"
          sx={{ color: "var(--text-muted)", py: 2, textAlign: "center" }}
        >
          No transactions on this card yet — add a{" "}
          <strong>Purchase</strong> in <strong>Transactions</strong> and pick this
          card.
        </Typography>
      )}

      {!loading && !error && visible.length > 0 && (
        <Stack spacing={1}>
          {visible.map((transaction) => {
            const moneyIn = isMoneyIn(transaction);

            /* Billing lifecycle — CREDIT-card PURCHASES only. Every
               other row (income, expenses, savings, the repayments
               themselves) is listed as before. */
            const lifecycle = credit && transaction.cType === "B";
            const entry = entryByPurchase.get(Number(transaction.nTransactionId));
            const paid = Boolean(entry) && ["P", "L", "A"].includes(entry.cStatus);
            const due = lifecycle ? purchaseDueDate(card, transaction) : null;
            const dueDay = due ? due.toISOString().slice(0, 10) : "";
            const today = todayStr();
            const unpaid = !paid && dueDay !== "";
            /* Red once the due date has arrived (or passed) and is unpaid. */
            const dueReached = unpaid && dueDay <= today;
            /* Missed entirely (strictly before today) -> Repay. */
            const missed = unpaid && dueDay < today;
            /* Due THIS month (today or later) -> PAY; due next month or
               later -> Advance. */
            const dueThisMonth =
              unpaid && !missed && dueDay.slice(0, 7) === today.slice(0, 7);
            const later = unpaid && !missed && !dueThisMonth;
            const button = lifecycle ? (missed ? "Repay" : dueThisMonth ? "PAY" : later ? "Advance" : "") : "";
            /* Status recorded with that button: late / paid / advance. */
            const payStatus = missed ? "L" : later ? "A" : "P";
            /* Advance gets its own blue to match the Advance Payment badge. */
            const btnColor = button === "Advance" ? "#1976d2" : "#2e7d32";
            const status = ENTRY_STATUS[entry?.cStatus];
            /* "Pay With" chooser maths — the picked source must cover
               the purchase amount before the payment can go through. */
            const amount = Number(transaction.dAmount) || 0;
            const balanceOk = currentBalance != null && currentBalance >= amount;
            const selectedCard = cards.find(
              (c) => String(c.nCardId) === String(payCardId)
            );
            const cardOk =
              Boolean(selectedCard) && spendableOf(selectedCard) >= amount;
            const chooserOpen =
              Boolean(button) && payOpenId === transaction.nTransactionId;
            const canPay = payWith === "balance" ? balanceOk : cardOk;

            return (
              <React.Fragment key={transaction.nTransactionId}>
                <Stack
                  direction="row"
                  spacing={1.5}
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
                  <TxnDetails>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {transaction.strTitle || "Untitled"}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "var(--text-muted)", display: "block" }}>
                      {formatDate(transaction.dttCreated)}
                      {due && (
                        <>
                          {" · "}
                          <Box
                            component="span"
                            sx={{
                              color: dueReached ? "#f44336" : "inherit",
                              fontWeight: dueReached ? 700 : "inherit",
                            }}
                          >
                            Due {fmtDay(due)}
                          </Box>
                        </>
                      )}
                      {transaction.strDescription ? ` · ${transaction.strDescription}` : ""}
                    </Typography>
                  </TxnDetails>

                  {lifecycle && (button || paid) ? (
                    /* Purchase with a billing state: amount over the
                       badge+undo pair (settled) or the action button. */
                    <Stack sx={{ flexShrink: 0, alignItems: "flex-end" }} spacing={0.5}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: moneyIn ? "#2e7d32" : "#f44336" }}
                      >
                        {moneyIn ? "+" : "−"}
                        {money(transaction.dAmount)}
                      </Typography>
                      {button ? (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={payingId === transaction.nTransactionId}
                          /* Every action button (Repay / PAY / Advance)
                             toggles the inline "Pay With" chooser. */
                          onClick={() => {
                            if (chooserOpen) {
                              setPayOpenId(null);
                            } else {
                              openPayChooser(transaction);
                            }
                          }}
                          sx={{
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
                          {payingId === transaction.nTransactionId ? "…" : button}
                        </Button>
                      ) : (
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                          <Chip
                            size="small"
                            label={status?.label || entry?.cStatus || "—"}
                            sx={{
                              height: 20,
                              bgcolor: status?.bg || "transparent",
                              color: status?.color || "var(--text-muted)",
                              fontWeight: 600,
                              fontSize: "0.65rem",
                            }}
                          />
                          <Tooltip title="Undo Payment">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Undo Payment"
                                disabled={payingId === transaction.nTransactionId}
                                onClick={() => handleUndo(transaction)}
                                sx={{
                                  color: "var(--text-muted)",
                                  "&:hover": {
                                    color: "#f44336",
                                    backgroundColor: "transparent",
                                  },
                                }}
                              >
                                <UndoIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      )}
                    </Stack>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        flexShrink: 0,
                        fontWeight: 700,
                        color: moneyIn ? "#2e7d32" : "#f44336",
                      }}
                    >
                      {moneyIn ? "+" : "−"}
                      {money(transaction.dAmount)}
                    </Typography>
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
                          const picked = cards.find(
                            (c) => String(c.nCardId) === String(v)
                          );
                          return picked
                            ? `${cardTitle(picked)} · ${money(spendableOf(picked))}`
                            : "Select a card";
                        }}
                        sx={{ minWidth: { xs: "auto", sm: 230 } }}
                      >
                        {cards.length === 0 ? (
                          <MenuItem disabled>No debit cards yet</MenuItem>
                        ) : (
                          cards.map((picked) => {
                            const ok = spendableOf(picked) >= amount;
                            return (
                              <MenuItem
                                key={picked.nCardId}
                                value={String(picked.nCardId)}
                                disabled={!ok}
                              >
                                {cardTitle(picked)} · {money(spendableOf(picked))}
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
                        disabled={!canPay || payingId === transaction.nTransactionId}
                        onClick={() =>
                          submitPayment(
                            transaction,
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
                        {payingId === transaction.nTransactionId
                          ? "…"
                          : `${button} ${money(amount)}`}
                      </Button>
                    </Stack>
                  </Box>
                )}
              </React.Fragment>
            );
          })}
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

/** Middle column of a transaction row: title over date/description. */
function TxnDetails({ children }) {
  return (
    <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0}>
      {children}
    </Stack>
  );
}
