import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  ListItemButton,
  Popover,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  SwapHorizOutlined as SwapIcon,
  ShoppingBagOutlined as PurchaseIcon,
  PaymentOutlined as PaymentIcon,
  AccountBalanceOutlined as BankIcon,
  AccountBalanceWalletOutlined as EWalletIcon,
  CreditCardOutlined as DebitIcon,
  CreditScoreOutlined as CreditIcon,
  HandshakeOutlined as LoanAccountIcon,
  PaymentsOutlined as CashIcon,
  VisibilityOutlined as ViewIcon,
  PublishedWithChangesOutlined as StatusIcon,
  PriceCheckOutlined as PaidIcon,
  Check as CheckIcon,
  ReceiptLongOutlined as ReceiptIcon,
} from "@mui/icons-material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import { ledgerService } from "../../../../../services/ledgerService";
import { categoryService } from "../../../../../services/categoryService";
import { accountService } from "../../../../../services/accountService";
import { loanService } from "../../../../../services/loanService";
import { useToast, creditBalance, accountBalance, loanSchedule, loanCreditBalance } from "../../shared";

/* Same visual language as the Ledger page: tinted direction circle
   (up = In, down = Out, swap = Transfer) with a status dot pinned on
   its upper-right edge. */
const TYPE_META = {
  IN: { color: "#2e7d32", Icon: TrendUpIcon },
  OUT: { color: "#d32f2f", Icon: TrendDownIcon },
  PRC: { color: "#7b1fa2", Icon: PurchaseIcon },
  PAY: { color: "#00897b", Icon: PaymentIcon },
  TRF: { color: "#1565c0", Icon: SwapIcon },
};

/* Icons/colors for the account summary card (same as Accounts page). */
const ACCOUNT_TYPE_META = {
  CASH: { label: "Cash", color: "#2e7d32", Icon: CashIcon },
  BANK: { label: "Bank", color: "#1565c0", Icon: BankIcon },
  DEBIT: { label: "Debit", color: "#00897b", Icon: DebitIcon },
  CREDIT: { label: "Credit", color: "#d97706", Icon: CreditIcon },
  LOAN: { label: "Loan", color: "#e65100", Icon: LoanAccountIcon },
  EWALLET: { label: "E-Wallet", color: "#7b1fa2", Icon: EWalletIcon },
};

/* Loan-lifecycle colors (same as the Loans page). */
const LOAN_STATUS_META = {
  ACTIVE: { label: "Active", color: "#2e7d32" },
  PAID: { label: "Completed", color: "#1565c0" },
  DEFAULTED: { label: "Defaulted", color: "#d32f2f" },
};

const STATUS_META = {
  PENDING: { label: "Pending", color: "#d97706" },
  POSTED: { label: "Posted", color: "#2e7d32" },
  VOID: { label: "Void", color: "var(--text-muted)" },
};

const STATUS_OPTIONS = ["PENDING", "POSTED", "VOID"];

const peso = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const prettyDate = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

/* Same rule as the loan entries viewer: past due and before today
   (midnight-safe comparison). */

export default function ViewLedgerEntriesModal({ open, onClose, account, onDataChange }) {
  const [entries, setEntries] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});
  const [paySources, setPaySources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusAnchor, setStatusAnchor] = useState(null);
  const [statusEntry, setStatusEntry] = useState(null);
  /* The entry whose inline "PAY USING" chooser is open (null = closed). */
  const [payEntryId, setPayEntryId] = useState(null);
  /* Loan-type accounts show their LINKED LOANS instead of ledger
     entries — loans whose nAccountId points here. */
  const [linkedLoans, setLinkedLoans] = useState([]);
  const [loanPaidCounts, setLoanPaidCounts] = useState(() => new Map());
  /* This account's loans' LN installments (for the Unpaid / Overdue
     stats) and the Active/Completed tab. */
  const [loanLedgerRows, setLoanLedgerRows] = useState([]);
  const [loanTab, setLoanTab] = useState("active");
  const { showToast, toastNode } = useToast();
  const navigate = useNavigate();

  const isLoanAccount = account?.cAccountType === "LOAN";

  /* Balance for the summary card: the credit left on the linked
     loans — total principal borrowed + paid principal shares, minus
     the account's Loan limit when one is set (interest excluded).
     Same helper the Accounts table uses. */
  const loanLeftTotal = loanCreditBalance(account, linkedLoans, loanPaidCounts);

  /* Loan-tab split: Completed = PAID loans; everything still open
     (Active / Defaulted) counts as Active. */
  const activeLoans = useMemo(
    () => linkedLoans.filter((l) => l.cStatus !== "PAID"),
    [linkedLoans]
  );
  const completedLoans = useMemo(
    () => linkedLoans.filter((l) => l.cStatus === "PAID"),
    [linkedLoans]
  );
  const visibleLoans = loanTab === "active" ? activeLoans : completedLoans;

  const fetchEntries = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      if (account.cAccountType === "LOAN") {
        /* Loan accounts: pull the loans linked via nAccountId and,
           from the ledger, how many installments of each are paid. */
        const [loans, ledgerRows] = await Promise.all([
          loanService.list(),
          ledgerService.list().catch(() => []),
        ]);
        const linked = (loans || []).filter((l) => l.nAccountId === account.nAccountId);
        setLinkedLoans(linked);
        /* Keep this account's loans' LN installments for the summary
           card's Unpaid / Overdue stats. */
        const linkedIds = new Set(linked.map((l) => l.nLoanId));
        setLoanLedgerRows(
          (ledgerRows || []).filter(
            (e) => e.cType === "LN" && e.nLoanId != null && linkedIds.has(e.nLoanId)
          )
        );
        const counts = new Map();
        for (const e of ledgerRows || []) {
          if (e.cType === "LN" && e.bIsPaid === true && e.nLoanId != null) {
            counts.set(e.nLoanId, (counts.get(e.nLoanId) || 0) + 1);
          }
        }
        setLoanPaidCounts(counts);
        setEntries([]);
        setPaySources([]);
        return;
      }
      /* Entries touching this account (as source, or as a transfer
         destination), newest first — the API already sorts that way.
         Also load the other accounts for the "pay using" chooser. */
      const [rows, categories, accountRows] = await Promise.all([
        ledgerService.list(),
        categoryService.list().catch(() => []),
        accountService.list().catch(() => []),
      ]);
      const filtered = (rows || []).filter(
        (e) => e.nAccountId === account.nAccountId || e.nToAccountId === account.nAccountId
      );
      setEntries(filtered);
      setLoanLedgerRows([]);
      setLoanPaidCounts(new Map());
      setCategoryMap(Object.fromEntries(categories.map((c) => [c.nCategoryId, c.strName])));
      /* Payment sources: any non-credit-card account, with its live
         balance (computed from the same entries) for the
         insufficient-funds check. */
      setPaySources(
        (accountRows || [])
          .filter((a) => a.cAccountType !== "CREDIT" && a.cAccountType !== "LOAN")
          .map((a) => ({ ...a, dBalance: accountBalance(a, rows || []) }))
      );
    } catch (err) {
      console.error("Error fetching account entries:", err);
      showToast(err.message || "Failed to load entries", "error");
    } finally {
      setLoading(false);
    }
  }, [account, showToast]);

  /* Load this account's entries each time the modal opens (and reset
     the statement tab back to Billed / the loan tab to Active). */
  React.useEffect(() => {
    if (open && account) {
      setEntriesTab("billed");
      setLoanTab("active");
      fetchEntries();
    }
  }, [open, account, fetchEntries]);

  /* Popover-based status changer on each entry row. */
  const handleOpenStatus = (entry, event) => {
    setStatusAnchor(event.currentTarget);
    setStatusEntry(entry);
  };
  const handleCloseStatus = () => {
    setStatusAnchor(null);
    setStatusEntry(null);
  };
  const handleStatusChange = async (entry, nextStatus) => {
    handleCloseStatus();
    if (nextStatus === entry.cStatus) return;
    try {
      await ledgerService.update(entry.nLedgerId, { cStatus: nextStatus });
      showToast("Status updated successfully!");
      await fetchEntries();
      onDataChange?.();
    } catch (err) {
      console.error("Status change error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  /* Paid/Unpaid toggle (credit-card charges & purchases only).
     Clicking PAY opens the inline "pay using" chooser; clicking
     UNPAID immediately marks the charge unpaid. */
  const handlePayClick = (entry) => {
    if (entry.bIsPaid) {
      handleSetPaid(entry, false, null);
    } else {
      setPayEntryId((prev) => (prev === entry.nLedgerId ? null : entry.nLedgerId));
    }
  };

  /* Marking paid ALSO inserts a real Payment (PAY) ledger entry on the
     source account for the charge total (amount + fee) — so the money
     actually leaves the paying account. The payment copies the charge's
     Category and Merchant, and stores the charge's id in Reference so
     UNPAID can find and delete the exact payment entry it created. */
  const handleSetPaid = async (entry, paid, source) => {
    setPayEntryId(null);
    try {
      if (paid && source) {
        /* Insufficient funds: the payment can't exceed the source
           account's balance. */
        const total = Number(entry.dAmount || 0) + Number(entry.dFee || 0);
        const balance = Number(source.dBalance ?? 0);
        if (total > balance) {
          showToast(
            `Payment (₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) exceeds ${source.strName}'s balance (₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}).`,
            "warning"
          );
          return;
        }
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
          now.getDate()
        ).padStart(2, "0")}`;
        await ledgerService.create({
          strTitle: `${account.strName} Payment`,
          cType: "PAY",
          dAmount: Number(entry.dAmount || 0) + Number(entry.dFee || 0),
          dFee: 0,
          dTransactionDate: today,
          nAccountId: source.nAccountId,
          nCategoryId: entry.nCategoryId ?? null,
          strMerchant: entry.strMerchant || null,
          strReference: String(entry.nLedgerId),
          cStatus: "POSTED",
        });
      }
      if (!paid) {
        /* UNPAID: delete the payment entry that was created for this
           charge (matched by Reference = the charge's ledger id). */
        const all = await ledgerService.list();
        const linked = (all || []).find(
          (e) => e.cType === "PAY" && e.strReference === String(entry.nLedgerId)
        );
        if (linked) await ledgerService.remove(linked.nLedgerId);
      }
      await ledgerService.update(entry.nLedgerId, { bIsPaid: paid });
      showToast(paid ? `Paid using ${source.strName} — payment recorded!` : "Marked as unpaid.");
      await fetchEntries();
      onDataChange?.();
    } catch (err) {
      console.error("Paid toggle error:", err);
      showToast(err.message || "Failed to update payment state", "error");
    }
  };

  /* Statement tabs: Billed / Unbilled / Overdue / Paid. "Billed" =
     unpaid charges made THIS month. (No Pending/Void tabs — those
     entries don't count toward balances, so they're hidden here.) */
  const [entriesTab, setEntriesTab] = useState("billed");

  const isThisMonth = (value) => {
    if (!value) return false;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  /* Credit-card due date for a charge, derived from the account's
     Statement Day and Due Day: charges made on/before the statement
     day belong to that month's statement, later ones to the next —
     the due date is the Due Day of the month AFTER the statement
     month (clamped to the month's length). Returns a Date, or null
     when the account has no statement/due day set. */
  const creditDueDateRaw = (value) => {
    if (!value) return null;
    const stmtDay = Number(account?.nStatementDay);
    const dueDay = Number(account?.nDueDay);
    if (!stmtDay || !dueDay) return null;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    const monthsToStatement = d.getDate() <= stmtDay ? 0 : 1;
    const due = new Date(d.getFullYear(), d.getMonth() + monthsToStatement + 1, 1);
    const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(dueDay, lastDay));
    return due;
  };

  const creditDueDate = (value) => {
    const due = creditDueDateRaw(value);
    return due
      ? due.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
      : null;
  };

  /* When a row actually becomes late: credit charges use the COMPUTED
     statement due date (not the transaction date — a charge made this
     month can be due next month); anything without a computed due
     date falls back to its transaction date. */
  const isRowOverdue = (row) => {
    const due =
      row.cType === "PRC"
        ? creditDueDateRaw(row.dTransactionDate)
        : row.dTransactionDate
          ? new Date(`${String(row.dTransactionDate).slice(0, 10)}T00:00:00`)
          : null;
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  const matchTab = useCallback(
    (row, tab) => {
      switch (tab) {
        case "paid":
          /* Pending/void entries belong to no tab — they don't count
             toward balances, so they're hidden here too. */
          return row.bIsPaid === true && row.cStatus !== "VOID" && row.cStatus !== "PENDING";
        case "overdue":
          return row.bIsPaid !== true && row.cStatus !== "PENDING" && row.cStatus !== "VOID" && isRowOverdue(row);
        case "billed":
          return (
            row.bIsPaid !== true &&
            row.cStatus !== "PENDING" &&
            row.cStatus !== "VOID" &&
            isThisMonth(row.dTransactionDate) &&
            !isRowOverdue(row)
          );
        case "unbilled":
          return (
            row.bIsPaid !== true &&
            row.cStatus !== "PENDING" &&
            row.cStatus !== "VOID" &&
            !isThisMonth(row.dTransactionDate) &&
            !isRowOverdue(row)
          );
        default:
          return true;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account]
  );

  /* "View" opens the entry where it lives — the Ledger page, with the
     Credit type filter preselected (?type=PRC) since this viewer is
     about a credit card's charges/payments. */
  const handleViewInLedger = () => {
    onClose();
    navigate("/ledger?type=PRC");
  };

  const rows = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        categoryName: categoryMap[e.nCategoryId] || null,
      })),
    [entries, categoryMap]
  );

  /* Tab-aware list + per-tab counts for the credit-card tabs. */
  const isCredit = account?.cAccountType === "CREDIT";
  const visibleEntries = useMemo(
    () => (isCredit ? rows.filter((r) => matchTab(r, entriesTab)) : rows),
    [rows, isCredit, entriesTab, matchTab]
  );
  const tabCounts = useMemo(() => {
    const count = (tab) => rows.filter((r) => matchTab(r, tab)).length;
    return { paid: count("paid"), billed: count("billed"), unbilled: count("unbilled"), overdue: count("overdue") };
  }, [rows, matchTab]);

  return (
    <>
      <ModalComponent
        open={open}
        onClose={onClose}
        type="view"
        title={
          account
            ? account.cAccountType === "LOAN"
              ? `Loans — ${account.strName}`
              : `Ledger entries — ${account.strName}`
            : "Ledger entries"
        }
        subtitle={
          account
            ? account.cAccountType === "LOAN"
              ? `${account.strInstitution || "Loan"} · ${linkedLoans.length} loan${linkedLoans.length === 1 ? "" : "s"}`
              : `${account.strInstitution || "Account"} · ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`
            : undefined
        }
        maxWidth="sm"
      >
        {account && (
          /* Summary card: type icon, name + bank details, live balance
             on the right, and a full-width mini-stat row (Limit /
             Unpaid / Overdue) below — same layout as the loan
             viewer's card. */
          <Box
            sx={{
              p: 1.25,
              mb: 1.5,
              border: "1px solid var(--border-light)",
              borderRadius: 2,
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            {(() => {
              const typeMeta = ACCOUNT_TYPE_META[account.cAccountType] || { color: "var(--text-muted)" };
              const isLoan = account.cAccountType === "LOAN";
              /* Live balance: credit = limit − unpaid charges; loan =
                 what's left of the linked loans' credit; others
                 recomputed from these very entries. */
              const balance = isLoan
                ? loanLeftTotal
                : account.cAccountType === "CREDIT"
                  ? creditBalance(account, entries)
                  : accountBalance(account, entries);
              /* Credit facts: unpaid posted charges and the overdue
                 portion of them (computed due dates passed). */
              const unpaidRows = entries.filter(
                (e) =>
                  e.cType === "PRC" &&
                  e.bIsPaid !== true &&
                  e.cStatus !== "VOID" &&
                  e.cStatus !== "PENDING"
              );
              const unpaidTotal = unpaidRows.reduce(
                (sum, e) => sum + Number(e.dAmount || 0) + Number(e.dFee || 0),
                0
              );
              const overdueRows = unpaidRows.filter((e) => isRowOverdue(e));
              const overdueTotal = overdueRows.reduce(
                (sum, e) => sum + Number(e.dAmount || 0) + Number(e.dFee || 0),
                0
              );
              /* Loan facts: the linked loans' unpaid installments and
                 their total interest cost (principal × rate% × term,
                 or monthly × term − principal — same math as the
                 Loans table, summed across loans). */
              const loanUnpaidRows = loanLedgerRows.filter(
                (e) => e.bIsPaid !== true && e.cStatus !== "VOID"
              );
              const loanUnpaidTotal = loanUnpaidRows.reduce(
                (sum, e) => sum + Number(e.dAmount || 0) + Number(e.dFee || 0),
                0
              );
              const loanInterestTotal = linkedLoans.reduce((sum, loan) => {
                const principal = Number(loan.dPrincipal || 0);
                const term = Number(loan.nTermMonths) || 0;
                const rate = loan.dInterestRate != null ? Number(loan.dInterestRate) : null;
                const monthly = loan.dMonthlyPayment != null ? Number(loan.dMonthlyPayment) : null;
                const interest =
                  rate != null && term > 0
                    ? principal * (rate / 100) * term
                    : monthly != null && term > 0
                      ? Math.max(0, monthly * term - principal)
                      : 0;
                return sum + interest;
              }, 0);
              /* Total principal borrowed across the linked loans. */
              const loanPrincipalTotal = linkedLoans.reduce(
                (sum, loan) => sum + Number(loan.dPrincipal || 0),
                0
              );
              return (
                <>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                  <Box
                    aria-hidden
                    sx={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `color-mix(in srgb, ${typeMeta.color} 14%, transparent)`,
                      color: typeMeta.color,
                      "& svg": { fontSize: 18 },
                    }}
                  >
                    {typeMeta.Icon ? <typeMeta.Icon /> : null}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {account.strName || "—"}
                      <Box component="span" sx={{ ml: 0.75 }}>
                        {account.bIsActive !== false ? (
                          <Box
                            component="span"
                            sx={{ fontSize: "0.65rem", fontWeight: 600, color: "#2e7d32" }}
                          >
                            Active
                          </Box>
                        ) : (
                          <Box
                            component="span"
                            sx={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)" }}
                          >
                            Inactive
                          </Box>
                        )}
                      </Box>
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {[
                        ACCOUNT_TYPE_META[account.cAccountType]?.label,
                        account.strInstitution,
                        account.strLast4 ? `••••${account.strLast4}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.2 }}
                    >
                      Balance
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        color: balance != null && Number(balance) < 0 ? "#d32f2f" : "var(--text-primary)",
                      }}
                    >
                      {peso(balance)}
                    </Typography>
                  </Box>
                  </Box>

                  {/* Mini-stat row (credit cards and Loan accounts):
                      the account's facts at a glance — cells expand
                      evenly across the full card width, each
                      right-aligned. */}
                  {(account.cAccountType === "CREDIT" || isLoan) && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        mt: 1.25,
                        pt: 1.25,
                        borderTop: "1px dashed var(--border-light)",
                      }}
                    >
                      {(isLoan
                        ? [
                            { label: "Limit", value: peso(account.dCreditLimit) },
                            { label: "Principal", value: peso(loanPrincipalTotal) },
                            { label: "Unpaid", value: peso(loanUnpaidTotal) },
                            { label: "Interest", value: peso(loanInterestTotal) },
                          ]
                        : [
                            { label: "Limit", value: peso(account.dCreditLimit) },
                            { label: "Unpaid", value: peso(unpaidTotal) },
                            {
                              label: "Overdue",
                              value: peso(overdueTotal),
                              color: overdueTotal > 0 ? "#d32f2f" : "var(--text-primary)",
                            },
                          ]
                      ).map((stat) => (
                        <Box key={stat.label} sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.2 }}
                          >
                            {stat.label}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              lineHeight: 1.2,
                              whiteSpace: "nowrap",
                              color: stat.color || "var(--text-primary)",
                            }}
                          >
                            {stat.value}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              );
            })()}
          </Box>
        )}

        {/* Statement tabs — credit cards only: Paid / Billed / Unbilled /
            Pending ("billed" = unpaid charges made this month). */}
        {isCredit && rows.length > 0 && (
          <Tabs
            value={entriesTab}
            onChange={(_, next) => setEntriesTab(next)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              mb: 1,
              minHeight: 30,
              "& .MuiTab-root": {
                minHeight: 30,
                px: 1.25,
                fontSize: "0.68rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
              },
              "& .MuiTab-root.Mui-selected": { color: "var(--accent)" },
              "& .MuiTabs-indicator": { backgroundColor: "var(--accent)", height: 2 },
            }}
          >
            <Tab value="billed" label={`Billed (${tabCounts.billed})`} />
            <Tab value="unbilled" label={`Unbilled (${tabCounts.unbilled})`} />
            <Tab value="overdue" label={`Overdue (${tabCounts.overdue})`} />
            <Tab value="paid" label={`Paid (${tabCounts.paid})`} />
          </Tabs>
        )}

        {isLoanAccount ? (
          /* Loan-type accounts show their linked loans instead of
             ledger rows — each row: loan title + lender, the monthly
             amount, the next due date, the paid/term progress, and a
             View button that opens the loan on the Loans page. */
          loading ? (
            <Typography variant="body2" sx={{ color: "var(--text-muted)", py: 2 }}>
              Loading loans…
            </Typography>
          ) : linkedLoans.length === 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                py: 4,
                px: 2,
                border: "1.5px dashed var(--border-medium)",
                borderRadius: 3,
                textAlign: "center",
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "color-mix(in srgb, #e65100 12%, transparent)",
                  color: "#e65100",
                  "& svg": { fontSize: 20 },
                }}
              >
                <LoanAccountIcon />
              </Box>
              <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
                No loans linked to this account yet.
              </Typography>
              <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Pick this account as a loan's Linked Account on the Loans page.
              </Typography>
            </Box>
          ) : (
            <>
              {/* Statement tabs — same set as the credit viewer:
                  Active (still open, incl. Defaulted) / Completed. */}
              <Tabs
                value={loanTab}
                onChange={(_, next) => setLoanTab(next)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  mb: 1,
                  minHeight: 30,
                  "& .MuiTab-root": {
                    minHeight: 30,
                    px: 1.25,
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--text-muted)",
                  },
                  "& .MuiTab-root.Mui-selected": { color: "var(--accent)" },
                  "& .MuiTabs-indicator": { backgroundColor: "var(--accent)", height: 2 },
                }}
              >
                <Tab value="active" label={`Active (${activeLoans.length})`} />
                <Tab value="completed" label={`Completed (${completedLoans.length})`} />
              </Tabs>
              {visibleLoans.length === 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.75,
                    py: 3,
                    px: 2,
                    border: "1.5px dashed var(--border-medium)",
                    borderRadius: 3,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
                    No {loanTab} loans.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--text-muted)", fontStyle: "italic" }}
                  >
                    {loanTab === "active" && "Loans set to Active appear here."}
                    {loanTab === "completed" && "Loans marked Paid (Completed) appear here."}
                  </Typography>
                </Box>
              ) : (
              <Stack spacing={1}>
                {visibleLoans.map((loan) => {
                const sched = loanSchedule(loan);
                const term = Number(loan.nTermMonths) || 0;
                const paidCount = loanPaidCounts.get(loan.nLoanId) ?? 0;
                const loanDone = term > 0 && paidCount >= term;
                const statusMeta = LOAN_STATUS_META[loan.cStatus] || {
                  label: loan.cStatus,
                  color: "var(--text-muted)",
                };
                return (
                  <Box
                    key={loan.nLoanId}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1,
                      border: "1px solid var(--border-light)",
                      borderRadius: 2,
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        position: "relative",
                        width: 30,
                        height: 30,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "color-mix(in srgb, #e65100 14%, transparent)",
                        color: "#e65100",
                        "& svg": { fontSize: 16 },
                      }}
                    >
                      <LoanAccountIcon />
                      <Box
                        aria-hidden
                        sx={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: statusMeta.color,
                          border: "1.5px solid var(--card-bg)",
                        }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: "var(--text-primary)",
                          fontWeight: 500,
                          fontSize: "0.75rem",
                          lineHeight: 1.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {loan.strName || "—"}
                      </Typography>
                      {/* Start - End range under the title (the end
                          comes from the last schedule month — same as
                          the Loans table). */}
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          color: "var(--text-muted)",
                          lineHeight: 1.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {[
                          prettyDate(loan.dStartDate),
                          sched?.at(-1) ? prettyDate(sched.at(-1).date) : null,
                        ]
                          .filter(Boolean)
                          .join(" - ") || "—"}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                      {/* Principal borrowed on top, the total interest
                          cost below it (same math as the Loans table:
                          principal × rate% × term, or monthly × term −
                          principal), then the paid/term progress. */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#e65100",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.75rem",
                        }}
                      >
                        {peso(loan.dPrincipal)}
                      </Typography>
                      {(() => {
                        const principal = Number(loan.dPrincipal || 0);
                        const rate =
                          loan.dInterestRate != null ? Number(loan.dInterestRate) : null;
                        const monthly =
                          loan.dMonthlyPayment != null ? Number(loan.dMonthlyPayment) : null;
                        const interest =
                          rate != null && term > 0
                            ? principal * (rate / 100) * term
                            : monthly != null && term > 0
                              ? Math.max(0, monthly * term - principal)
                              : null;
                        if (interest == null) return null;
                        return (
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                              lineHeight: 1.2,
                              fontSize: "0.65rem",
                            }}
                          >
                            {rate != null
                              ? `Int(${rate}%): ${peso(interest)}`
                              : `Int: ${peso(interest)}`}
                          </Typography>
                        );
                      })()}
                      <Typography
                        variant="body2"
                        sx={{
                          color: loanDone ? "#2e7d32" : "var(--text-primary)",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.65rem",
                        }}
                      >
                        {paidCount}/{term || "—"}
                      </Typography>
                    </Box>
                    <Tooltip title="Open on the Loans page" arrow>
                      <IconButton
                        size="small"
                        aria-label={`Open ${loan.strName || "loan"} on the Loans page`}
                        onClick={() => navigate(`/loans?open=${loan.nLoanId}`)}
                        sx={{
                          borderRadius: 1.5,
                          color: "#2563eb",
                          backgroundColor: "color-mix(in srgb, #2563eb 12%, transparent)",
                          "&:hover": {
                            backgroundColor: "color-mix(in srgb, #2563eb 22%, transparent)",
                          },
                        }}
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                );
              })}
              </Stack>
              )}
            </>
          )
        ) : loading ? (
          <Typography variant="body2" sx={{ color: "var(--text-muted)", py: 2 }}>
            Loading entries…
          </Typography>
        ) : rows.length === 0 ? (
          /* Dashed empty-state card (same language as the summary card). */
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              py: 4,
              px: 2,
              border: "1.5px dashed var(--border-medium)",
              borderRadius: 3,
              textAlign: "center",
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "color-mix(in srgb, var(--text-muted) 12%, transparent)",
                color: "var(--text-muted)",
                "& svg": { fontSize: 20 },
              }}
            >
              <ReceiptIcon />
            </Box>
            <Typography
              variant="body2"
              sx={{ color: "var(--text-muted)", fontWeight: 500 }}
            >
              No ledger entries for this account yet.
            </Typography>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Use the ⇄ Transfer button on the account row to add the first one.
            </Typography>
          </Box>
        ) : visibleEntries.length === 0 ? (
          /* A tab is active but has nothing in it. */
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.75,
              py: 3,
              px: 2,
              border: "1.5px dashed var(--border-medium)",
              borderRadius: 3,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
              No {entriesTab === "billed" ? "billed" : entriesTab} entries.
            </Typography>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              {entriesTab === "billed" && "Billed = unpaid charges made this month."}
              {entriesTab === "unbilled" && "Unbilled = unpaid charges from other months."}
              {entriesTab === "overdue" && "Overdue = unpaid charges past their due date."}
              {entriesTab === "paid" && "Charges you've marked as paid."}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {visibleEntries.map((row) => {
              const typeMeta = TYPE_META[row.cType] || { color: "var(--text-muted)" };
              const status = STATUS_META[row.cStatus] || { label: row.cStatus, color: "var(--text-muted)" };
              const caption =
                [row.strMerchant, row.categoryName].filter(Boolean).join(" - ") ||
                row.strReference ||
                "—";
              return (
                <React.Fragment key={row.nLedgerId}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1,
                      border: "1px solid var(--border-light)",
                      borderRadius: 2,
                      backgroundColor: "var(--bg-secondary)",
                  }}
                >
                  {/* Direction circle + status dot — identical to the
                      Ledger page's Title column. */}
                  <Tooltip title={`Status: ${status.label}`} arrow>
                    <Box
                      sx={{
                        position: "relative",
                        width: 30,
                        height: 30,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: `color-mix(in srgb, ${typeMeta.color} 14%, transparent)`,
                        color: typeMeta.color,
                        "& svg": { fontSize: 16 },
                      }}
                    >
                      {typeMeta.Icon ? <typeMeta.Icon /> : null}
                      <Box
                        aria-hidden
                        sx={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: status.color,
                          border: "1.5px solid var(--card-bg)",
                        }}
                      />
                    </Box>
                  </Tooltip>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.strTitle || "—"}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {caption}
                    </Typography>
                  </Box>

                  {/* Amount, then fee + larger total only when there IS
                      a fee. Inflows keep their "+" and transfers "=" —
                      everything else (charges, outflows, payments)
                      shows the plain amount, no sign. */}
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: typeMeta.color,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                        fontSize: "0.65rem",
                      }}
                    >
                      {row.cType === "IN" ? "+" : ""}
                      {peso(row.dAmount)}
                    </Typography>
                    {/* Fee and total only appear when there IS a fee —
                        with no fee the total would just duplicate the
                        amount. */}
                    {Number(row.dFee) > 0 && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.65rem",
                        }}
                      >
                        + {peso(row.dFee)} fee
                      </Typography>
                    )}
                    {Number(row.dFee) > 0 && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: typeMeta.color,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.75rem",
                        }}
                      >
                        {row.cType === "TRF" ? "= " : row.cType === "IN" ? "+" : ""}
                        {peso(Number(row.dAmount || 0) + Number(row.dFee || 0))}
                      </Typography>
                    )}
                    {/* Charges show their DUE date instead of the
                        transaction date, derived from the card's
                        Statement Day + Due Day (e.g. a charge made
                        before the 16th → due the 4th next month).
                        Other entry types keep the plain date. */}
                    {row.cType === "PRC" && creditDueDate(row.dTransactionDate) ? (
                      <Typography
                        variant="body2"
                        sx={{
                          color: row.bIsPaid
                            ? "var(--text-muted)"
                            : isRowOverdue(row)
                              ? "#d32f2f"
                              : "#d97706",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.65rem",
                        }}
                      >
                        Due {creditDueDate(row.dTransactionDate)}
                      </Typography>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "var(--text-muted)",
                          fontStyle: "italic",
                          fontWeight: 400,
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.65rem",
                        }}
                      >
                        {prettyDate(row.dTransactionDate)}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                    <Tooltip title="View in Ledger" arrow>
                      <IconButton
                        size="small"
                        aria-label={`View ${row.strTitle || "entry"} in Ledger`}
                        onClick={handleViewInLedger}
                        sx={{
                          borderRadius: 1.5,
                          color: "#2563eb",
                          backgroundColor: "color-mix(in srgb, #2563eb 12%, transparent)",
                          "&:hover": {
                            backgroundColor: "color-mix(in srgb, #2563eb 22%, transparent)",
                          },
                        }}
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {/* Status changer — hidden for credit cards: the
                        statement is managed via the Pay/Unpaid + Void
                        tabs, not the status popover. */}
                    {!isCredit && (
                      <Tooltip title={`Change status (now: ${status.label})`} arrow>
                        <IconButton
                          size="small"
                          aria-label={`Change status of ${row.strTitle || "entry"}`}
                          onClick={(event) => handleOpenStatus(row, event)}
                          sx={{
                            borderRadius: 1.5,
                            color: status.color,
                            backgroundColor: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                            "&:hover": {
                              backgroundColor: `color-mix(in srgb, ${status.color} 22%, transparent)`,
                            },
                          }}
                        >
                          <StatusIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* Paid/Unpaid toggle — only for credit-card charges
                        (this account is a credit card or it's a Credit),
                        and never on a voided charge. The label is the
                        ACTION: "Pay" when unpaid, "Unpaid" to undo. */}
                    {row.cStatus !== "VOID" &&
                    (account?.cAccountType === "CREDIT" || row.cType === "PRC") && (
                      <Tooltip
                        title={row.bIsPaid ? "Mark as unpaid" : "Mark as paid"}
                        arrow
                      >
                        <Button
                          size="small"
                          aria-label={`${row.bIsPaid ? "Mark unpaid" : "Pay"}: ${row.strTitle || "entry"}`}
                          onClick={() => handlePayClick(row)}
                          startIcon={<PaidIcon />}
                          sx={{
                            height: 26,
                            minHeight: 26,
                            px: 0.75,
                            borderRadius: 1.5,
                            color: row.bIsPaid ? "var(--text-muted)" : "#2e7d32",
                            backgroundColor: `color-mix(in srgb, ${
                              row.bIsPaid ? "var(--text-muted)" : "#2e7d32"
                            } 12%, transparent)`,
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                            whiteSpace: "nowrap",
                            "& .MuiButton-startIcon": { mr: 0 },
                            "& svg": { fontSize: 13 },
                            "&:hover": {
                              backgroundColor: `color-mix(in srgb, ${
                                row.bIsPaid ? "var(--text-muted)" : "#2e7d32"
                              } 22%, transparent)`,
                            },
                          }}
                        >
                          {row.bIsPaid ? "Unpaid" : "Pay"}
                        </Button>
                      </Tooltip>
                    )}
                  </Stack>
                </Box>

                {/* Inline "PAY USING" chooser — opens under the row whose
                    PAY button was clicked, listing non-credit accounts. */}
                {payEntryId === row.nLedgerId && (
                  <Box
                    sx={{
                      ml: 3,
                      p: 1.25,
                      border: "1px dashed var(--border-medium)",
                      borderRadius: 2,
                      backgroundColor: "var(--card-bg)",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mb: 0.75,
                        color: "var(--text-muted)",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Pay using:
                    </Typography>
                    {paySources.length === 0 ? (
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                        No cash/bank accounts to pay from — create one on the Accounts page.
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.75,
                          alignItems: "center",
                        }}
                      >
                        {paySources.map((source) => {
                          /* A source that can't cover this charge's
                             total (amount + fee) renders red. */
                          const payTotal = Number(row.dAmount || 0) + Number(row.dFee || 0);
                          const insufficient =
                            source.dBalance != null &&
                            !Number.isNaN(Number(source.dBalance)) &&
                            Number(source.dBalance) < payTotal;
                          return (
                          <Button
                            key={source.nAccountId}
                            size="small"
                            onClick={() => handleSetPaid(row, true, source)}
                            sx={{
                              height: 26,
                              minHeight: 26,
                              px: 1,
                              borderRadius: 1.5,
                              border: "1px solid var(--border-medium)",
                              color: "var(--text-primary)",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              textTransform: "none",
                              whiteSpace: "nowrap",
                              "&:hover": {
                                borderColor: "#2e7d32",
                                color: "#2e7d32",
                                backgroundColor: "color-mix(in srgb, #2e7d32 10%, transparent)",
                              },
                              ...(insufficient && {
                                borderColor: "#d32f2f",
                                color: "#d32f2f",
                                backgroundColor: "color-mix(in srgb, #d32f2f 8%, transparent)",
                                "&:hover": {
                                  borderColor: "#d32f2f",
                                  color: "#d32f2f",
                                  backgroundColor: "color-mix(in srgb, #d32f2f 14%, transparent)",
                                },
                              }),
                            }}
                          >
                            {source.strName}
                            {source.strInstitution ? `(${source.strInstitution})` : ""}
                            {source.strLast4 ? ` ••••${source.strLast4}` : ""}
                            {source.dBalance != null &&
                            !Number.isNaN(Number(source.dBalance))
                              ? ` (₱${Number(source.dBalance).toLocaleString("en-PH", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })})`
                              : ""}
                          </Button>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                )}
                </React.Fragment>
              );
            })}
          </Stack>
        )}
      </ModalComponent>

      {/* Tooltip-style popover on an entry's status button. */}
      <Popover
        open={Boolean(statusAnchor) && Boolean(statusEntry)}
        anchorEl={statusAnchor}
        onClose={handleCloseStatus}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 150,
              p: 0.5,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              backgroundColor: "var(--card-bg)",
            },
          },
        }}
      >
        {statusEntry &&
          STATUS_OPTIONS.map((value) => {
            const meta = STATUS_META[value];
            const isCurrent = statusEntry.cStatus === value;
            return (
              <ListItemButton
                key={value}
                dense
                selected={isCurrent}
                onClick={() => handleStatusChange(statusEntry, value)}
                sx={{
                  borderRadius: 1.5,
                  gap: 1,
                  color: "var(--text-primary)",
                  "&:hover": {
                    backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)",
                  },
                  "&.Mui-selected": {
                    backgroundColor: "color-mix(in srgb, var(--text-primary) 12%, transparent)",
                  },
                }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: meta.color, flexShrink: 0 }}
                />
                <Typography variant="body2" sx={{ flex: 1, color: "var(--text-primary)" }}>
                  {meta.label}
                </Typography>
                {isCurrent && <CheckIcon sx={{ fontSize: 16, color: "var(--text-muted)" }} />}
              </ListItemButton>
            );
          })}
      </Popover>

      {toastNode}
    </>
  );
}
