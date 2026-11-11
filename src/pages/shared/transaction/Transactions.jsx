import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  ReceiptLong as TransactionsIcon,
} from "@mui/icons-material";
import DataTable from "../../../components/ui/DataTable";
import FilterMenu from "../../../components/ui/FilterMenu";
import TransactionAEModal from "./modals/TransactionAEModal";
import { cardTitle } from "../../../lib/cards";
import { formatDatePH, parseInstant } from "../../../lib/time";
import {
  CARD_DEDUCTION_MARKERS,
  CARD_LOAN_PAYMENT_DESCRIPTION,
  CARD_REPAYMENT_DESCRIPTION,
} from "../../../lib/kpiStats";
import { transactionService } from "../../../services/transactionService";
import { cardService } from "../../../services/cardService";

/* ₱ amounts — change the locale/currency here if you need another one. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/* Dates always read as PHILIPPINE TIME — the app's home timezone —
   no matter where the browser or server sits (see lib/time). */
const formatDate = formatDatePH;

/* "2 days ago", "1 week ago", "just now" — shown under the date so the
   row's age reads at a glance. */
const timeAgo = (value) => {
  const then = parseInstant(value)?.getTime() ?? NaN;
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units = [
    { limit: 31536000, label: "year" },
    { limit: 2592000, label: "month" },
    { limit: 604800, label: "week" },
    { limit: 86400, label: "day" },
    { limit: 3600, label: "hour" },
    { limit: 60, label: "minute" },
  ];
  for (const { limit, label } of units) {
    if (seconds >= limit) {
      const count = Math.floor(seconds / limit);
      return `${count} ${label}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
};

const TYPE_META = {
  I: { label: "Income", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  /* E = Expense — money going out. It may also carry a card link
     (nCardId): the Savings / Loans tabs write one of those alongside
     the Savings/Payment row when a deposit or installment is paid
     FROM a card, so the card's balance takes the deduction (that
     companion row is locked in the table and skipped in the balance —
     its own ledger row carries the entry). */
  E: { label: "Expense", color: "#f44336", bg: "rgba(244, 67, 54, 0.14)" },
  /* B = Purchase — money spent ON A CARD (charged to a card from the
     Cards tab through the transaction's nCardId). It counts towards
     expense below, like E, but unlike E it always carries a card. */
  B: { label: "Purchase", color: "#ed6c02", bg: "rgba(237, 108, 2, 0.14)" },
  /* P = Payment — a loan installment auto-created by the Loans tab
     (title "<loan title> - <due date>", description "Loan Payment").
     It is money going out, so it counts towards expense below. */
  P: { label: "Payment", color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.14)" },
  /* S = Savings deposit — auto-created by the Savings tab when an
     entry is added (title "<saving title> - <date added>", description
     "Savings deposit"). Money leaving the balance into the fund, so it
     counts towards expense (a deposit paid from a card also writes an
     E row with the card link — see E above). */
  S: { label: "Savings", color: "#00838f", bg: "rgba(0, 131, 143, 0.14)" },
};

/* The type filter shown in the FilterMenu below the search row — "all"
   shows every row (each type stays selectable from the menu). */
const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "I", label: "Income" },
  { value: "E", label: "Expense" },
  { value: "B", label: "Purchase" },
  { value: "P", label: "Payment" },
  { value: "S", label: "Savings" },
];

/* Must stay in step with TRANSFER_DESCRIPTION in server/utils/schedule.js:
   a "Transfer to Fund" is logged as a plain `I` row (so it counts as
   income) carrying this description — tbltransactions has no flag column,
   so the text is what identifies it. */
const TRANSFER_DESCRIPTION = "Transfer to fund";
const isTransferRow = (row) =>
  row?.cType === "I" && row?.strDescription === TRANSFER_DESCRIPTION;

/* Must stay in step with BUDGET_PLAN_DESCRIPTION in
   server/utils/schedule.js: a budget plan that has been USED writes its
   entries into the ledger as plain expenses carrying this description.
   The row belongs to the plan, so it is locked here — activating the
   plan again is what removes it. */
const BUDGET_PLAN_DESCRIPTION = "Budget plan expense";
const isBudgetPlanRow = (row) =>
  row?.cType === "E" && row?.strDescription === BUDGET_PLAN_DESCRIPTION;

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  /* The user's debit/credit cards — only feed the dialog's Card picker
     (the transaction rows themselves never live on this page). */
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  /* Seeded once from ?type=B (the dashboard's Purchase shortcut) so
     deep links arrive with the matching type preselected; the menu
     below can still change it like any other filter. */
  const [searchParams] = useSearchParams();
  const [typeFilter, setTypeFilter] = useState(() => {
    const preset = searchParams.get("type");
    return FILTER_OPTIONS.some((o) => o.value === preset) ? preset : "all";
  });
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await transactionService.list();
      setTransactions(data || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      showToast(err.message || "Failed to load transactions", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  /* Cards only power the dialog's picker — a failure here must not
     break the ledger, so it is logged, not toasted. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await cardService.list();
        if (alive) setCards(data || []);
      } catch (err) {
        console.error("Error fetching cards for the picker:", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visibleRows = useMemo(
    () => (typeFilter === "all" ? transactions : transactions.filter((t) => t.cType === typeFilter)),
    [transactions, typeFilter]
  );

  const handleOpenAdd = () => {
    setEditingTransaction(null);
    /* nCardId rides as a string ("" = no card) so the dialog's select
       always has a matching option; it is parsed back to a number (or
       null) in the payload below. */
    setFormData({ strTitle: "", cType: "I", dAmount: "", nCardId: "", strDescription: "" });
    setModalOpen(true);
  };

  const handleOpenEdit = (transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      strTitle: transaction.strTitle || "",
      cType: transaction.cType || "I",
      dAmount: transaction.dAmount ?? "",
      nCardId: transaction.nCardId != null ? String(transaction.nCardId) : "",
      strDescription: transaction.strDescription || "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingTransaction(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      /* The Card field exists for Income (debit cards), Expense and
         Purchase (any card) — switching to a type that cannot hold the
         picked card drops it, so a stale link never rides along. */
      if (name === "cType" && next.nCardId) {
        const card = cards.find((c) => String(c.nCardId) === String(next.nCardId));
        const stillValid =
          (value === "B" && card) ||
          (value === "E" && card) ||
          (value === "I" && card?.cType === "D");
        if (!stillValid) next.nCardId = "";
      }
      return next;
    });
  };

  const handleSaveTransaction = async () => {
    if (!formData.strTitle?.trim()) {
      showToast("Title is required.", "warning");
      return;
    }
    const amount = Number(formData.dAmount);
    if (formData.dAmount === "" || formData.dAmount === null || !Number.isFinite(amount)) {
      showToast("Amount must be a valid number.", "warning");
      return;
    }
    if (amount < 0) {
      showToast("Amount cannot be negative.", "warning");
      return;
    }
    if (!["I", "E", "B"].includes(formData.cType)) {
      showToast("Please choose Income, Expense, or Purchase.", "warning");
      return;
    }
    /* Income may only land on a debit card (money in); a Purchase may
       charge any card. The server enforces the same pairing. */
    if (formData.cType === "I" && formData.nCardId) {
      const picked = cards.find((c) => String(c.nCardId) === String(formData.nCardId));
      if (picked && picked.cType !== "D") {
        showToast("Income can only be linked to a debit card.", "warning");
        return;
      }
    }

    const payload = {
      strTitle: formData.strTitle.trim(),
      cType: formData.cType,
      dAmount: amount,
      /* The card link ("" means no card → null on the row). Income
         (debit cards only), Expense and Purchase (any card) may carry
         one — the server enforces the same pairing. */
      nCardId:
        (formData.cType === "B" ||
          formData.cType === "E" ||
          formData.cType === "I") &&
        formData.nCardId
          ? Number(formData.nCardId)
          : null,
      strDescription: formData.strDescription?.trim() || null,
    };

    setSaving(true);
    try {
      if (editingTransaction) {
        await transactionService.update(editingTransaction.nTransactionId, payload);
        showToast("Transaction updated successfully!");
      } else {
        await transactionService.create(payload);
        showToast("Transaction created successfully!");
      }

      handleCloseModal();
      await fetchTransactions();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save transaction", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;

    try {
      await transactionService.remove(id);
      showToast("Transaction deleted successfully!");
      await fetchTransactions();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete transaction", "error");
    }
  };

  const columns = [
    {
      id: "strTitle",
      label: "Title",
      minWidth: 180,
      /* The code sits on its own small line on top, then the title +
         an optional card badge ("BPI(C)") when the row was charged to
         a card, with the optional description below — the old
         standalone Code, Card and Description columns folded in here
         so the table stays narrower on mobile. */
      format: (value, row) => {
        const card = row.nCardId
          ? cards.find((c) => c.nCardId === row.nCardId)
          : null;
        return (
          <Box sx={{ minWidth: 0 }}>
            {row.strCode && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  fontSize: "0.65rem",
                  letterSpacing: "0.04em",
                }}
              >
                {row.strCode}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {value || "—"}
              </Typography>
              {card && (
                <Chip
                  size="small"
                  label={`${card.strBankName || cardTitle(card)}(${card.cType})`}
                  sx={{
                    flexShrink: 0,
                    fontWeight: 600,
                    fontSize: "0.68rem",
                    height: 20,
                    /* Theme vars flip with data-theme, so the badge reads
                       right in both light and dark (MUI's default Chip
                       stays grey in dark mode — it doesn't see the vars). */
                    bgcolor: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-light)",
                  }}
                />
              )}
            </Stack>
            {/* Always renders — reads "No Description Attached" when
                the row carries none (faded so it reads as a placeholder). */}
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                opacity: row.strDescription ? 1 : 0.75,
                fontStyle: "italic",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.strDescription || "No Description Attached"}
            </Typography>
          </Box>
        );
      },
    },
    /* The old standalone Amount column folded in here: the type label
       sits on top (uppercase, in the type's color) with the amount
       larger right below it — the chip badge is gone. */
    {
      id: "cType",
      label: "Amount",
      minWidth: 140,
      align: "right",
      format: (value, row) => {
        const meta = TYPE_META[value] || { label: value || "—", color: "var(--text-muted)" };
        /* Only Income is money in; E (including a savings deposit paid
           from a card), P and S all move money out. */
        const moneyIn = row.cType === "I";
        return (
          <Box sx={{ minWidth: 0, textAlign: "right" }}>
            <Typography
              variant="caption"
              sx={{
                color: meta.color,
                fontWeight: 700,
                fontSize: "0.68rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {meta.label}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: moneyIn ? "#2e7d32" : "#f44336",
                fontWeight: 700,
                fontSize: "1.05rem",
                lineHeight: 1.2,
              }}
            >
              {moneyIn ? "+" : "−"}
              {money(row.dAmount)}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "dttCreated",
      label: "Date",
      minWidth: 120,
      align: "right",
      /* The date on top, with the italic relative age ("2 days ago")
         on a second muted line below it. */
      format: (value) => (
        <Box sx={{ minWidth: 0, textAlign: "right" }}>
          <Typography
            variant="body2"
            sx={{ color: "var(--text-primary)", fontWeight: 500 }}
          >
            {formatDate(value)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            {timeAgo(value)}
          </Typography>
        </Box>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => {
        /* P (loan installments and card repayments) and S (savings
           deposits) are written by the Loans / Savings / Cards tabs and
           mirror an entry's lifecycle, so their buttons render greyed
           out and do nothing — the row is shown, not editable. A
           Transfer to Fund is locked for the same reason: it is the
           income half of a deposit, and dropping it alone would leave
           the saving holding money this tab no longer accounts for
           (deleting the deposit in Savings removes it).
           The Expense companion of a card-paid deposit, installment or
           repayment is locked for the same reason — deleting it here
           would leave the card's deduction unpaired (removing the entry
           in Savings / undoing the payment in Loans or Cards removes
           both rows). */
        const transfer = isTransferRow(row);
        const companion =
          row.cType === "E" &&
          row.nCardId != null &&
          CARD_DEDUCTION_MARKERS.includes(row.strDescription);
        /* A used budget plan's expense belongs to the plan, so it is
           locked here too — activating the plan again removes it. */
        const budgetPlan = isBudgetPlanRow(row);
        const locked =
          row.cType === "P" || row.cType === "S" || transfer || companion || budgetPlan;
        const hint =
          row.cType === "P"
            ? "Locked — created by the Loans or Cards tab"
            : row.cType === "S"
              ? "Locked — created by the Savings tab"
              : budgetPlan
                ? "Locked — created by a budget plan; activate the plan to remove it"
                : companion
                  ? row.strDescription === CARD_LOAN_PAYMENT_DESCRIPTION
                    ? "Locked — a card-paid installment; undo the payment in Loans"
                    : row.strDescription === CARD_REPAYMENT_DESCRIPTION
                      ? "Locked — a card-paid repayment; undo the payment in Cards"
                      : "Locked — a card-paid deposit; remove the deposit in Savings"
                  : "Locked — a Transfer to Fund; remove the deposit in Savings";
        const style = (color) =>
          locked
            ? { color: "var(--text-muted)", opacity: 0.45, cursor: "not-allowed" }
            : { color, cursor: "pointer", "&:hover": { opacity: 0.7 } };
        return (
          <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
            <Tooltip title={locked ? hint : "Edit"}>
              <span>
                <EditIcon
                  sx={style("var(--accent)")}
                  onClick={locked ? undefined : () => handleOpenEdit(row)}
                />
              </span>
            </Tooltip>
            <Tooltip title={locked ? hint : "Delete"}>
              <span>
                <DeleteIcon
                  sx={style("#f44336")}
                  onClick={locked ? undefined : () => handleDeleteTransaction(row.nTransactionId)}
                />
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      <DataTable
        title="Transactions"
        titleIcon={<TransactionsIcon />}
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nTransactionId"
        onAddClick={handleOpenAdd}
        addButtonLabel="Add Transaction"
        searchPlaceholder="Search by code, title, description..."
        searchFields={["strCode", "strTitle", "strDescription"]}
        filters={
          <FilterMenu
            value={typeFilter}
            onChange={setTypeFilter}
            options={FILTER_OPTIONS}
            counts={{
              all: transactions.length,
              ...Object.fromEntries(
                FILTER_OPTIONS.filter((o) => o.value !== "all").map((o) => [
                  o.value,
                  transactions.filter((t) => t.cType === o.value).length,
                ])
              ),
            }}
            label="Filter by transaction type"
          />
        }
      />

      <TransactionAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveTransaction}
        editingTransaction={editingTransaction}
        formData={formData}
        onChange={handleFieldChange}
        cards={cards}
        saving={saving}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
