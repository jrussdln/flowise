import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AccountBalance as BalanceIcon,
  AccountBalanceOutlined as BankIcon,
  AccountBalanceWalletOutlined as WalletIcon,
  ArrowOutward as InIcon,
  CategoryOutlined as CategoryIcon,
  CreditCardOutlined as CreditIcon,
  CreditCardOutlined as DebitIcon,
  EventNoteOutlined as BillsIcon,
  HandshakeOutlined as LoanIcon,
  PaymentsOutlined as CashIcon,
  ReceiptLongOutlined as ReceiptIcon,
  SouthEast as DownIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import { accountService } from "../../../../services/accountService";
import { ledgerService } from "../../../../services/ledgerService";
import { loanService } from "../../../../services/loanService";
import { categoryService } from "../../../../services/categoryService";
import {
  accountBalance,
  creditBalance,
  loanCreditBalance,
  useToast,
} from "../../finance/shared";

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isPosted = (e) => e.cStatus !== "VOID" && e.cStatus !== "PENDING";

/* Account-type chrome for the Accounts card rows — same colors as
   the Accounts page so the dashboard stays consistent. */
const ACCOUNT_META = {
  CASH: { label: "Cash", color: "#2e7d32", Icon: CashIcon },
  BANK: { label: "Bank", color: "#1565c0", Icon: BankIcon },
  DEBIT: { label: "Debit", color: "#00897b", Icon: DebitIcon },
  CREDIT: { label: "Credit", color: "#d97706", Icon: CreditIcon },
  LOAN: { label: "Loan", color: "#e65100", Icon: LoanIcon },
  EWALLET: { label: "E-Wallet", color: "#7b1fa2", Icon: WalletIcon },
};

const monthPrefix = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

/* A loan's outstanding principal (paid installments restore their
   principal share — interest never counts). */
const loanOutstanding = (loan, paidCount) => {
  const principal = Number(loan.dPrincipal || 0);
  const term = Number(loan.nTermMonths) || 0;
  if (!(principal > 0) || !(term > 0)) return 0;
  const paid = Math.min(paidCount ?? 0, term);
  return Math.max(0, principal - paid * (principal / term));
};

/* Tinted icon chip for card rows — same 26px circular style as the
   Accounts card rows. */
function RowIcon({ icon, color }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        "& svg": { fontSize: 14 },
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
  );
}

export default function Dashboard() {
  const { showToast, toastNode } = useToast();
  const navigate = useNavigate();
  /* Amounts are visible by default — the eye toggle hides them. */
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loans, setLoans] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [accountRows, ledgerRows, loanRows, categoryRows] = await Promise.all([
        accountService.list().catch(() => []),
        ledgerService.list().catch(() => []),
        loanService.list().catch(() => []),
        categoryService.list().catch(() => []),
      ]);
      setAccounts(accountRows || []);
      setEntries(ledgerRows || []);
      setLoans(loanRows || []);
      setCategoryMap(Object.fromEntries((categoryRows || []).map((c) => [c.nCategoryId, c.strName])));
    } catch (err) {
      console.error("Error loading dashboard:", err);
      showToast(err.message || "Failed to load dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const metrics = useMemo(() => {
    const prefix = monthPrefix();
    const posted = entries.filter(isPosted);

    /* ── Current balance: cash / bank / debit / e-wallets only —
          credit cards and Loan accounts hold no spendable cash. ── */
    const liquidAccounts = accounts
      .filter((a) => ["CASH", "BANK", "DEBIT", "EWALLET"].includes(a.cAccountType))
      .map((a) => ({ ...a, dBalance: accountBalance(a, entries) }))
      .sort((a, b) => Number(b.dBalance) - Number(a.dBalance));
    const currentBalance = liquidAccounts.reduce((s, a) => s + Number(a.dBalance || 0), 0);

    /* ── This month's cash flow ── */
    const monthRows = posted.filter((e) => String(e.dTransactionDate).slice(0, 7) === prefix);
    const monthIn = monthRows
      .filter((e) => e.cType === "IN")
      .reduce((s, e) => s + Number(e.dAmount || 0), 0);
    const monthInCount = monthRows.filter((e) => e.cType === "IN").length;
    const monthOutRows = monthRows.filter((e) => ["OUT", "PRC", "PAY"].includes(e.cType));
    const monthOut = monthOutRows.reduce(
      (s, e) => s + Number(e.dAmount || 0) + Number(e.dFee || 0),
      0
    );
    const monthTransfers = monthRows.filter((e) => e.cType === "TRF");
    const monthTransferTotal = monthTransfers.reduce((s, e) => s + Number(e.dAmount || 0), 0);

    /* ── Credit cards: used vs total limit ── */
    const creditCards = accounts.filter((a) => a.cAccountType === "CREDIT");
    const creditLimitTotal = creditCards.reduce((s, a) => s + Number(a.dCreditLimit || 0), 0);
    const creditCardCount = creditCards.length;
    const creditsUsed = posted
      .filter((e) => e.cType === "PRC" && e.bIsPaid !== true)
      .reduce((s, e) => s + Number(e.dAmount || 0) + Number(e.dFee || 0), 0);

    /* ── Loans: outstanding, loanable, due / overdue ── */
    const paidCounts = new Map();
    for (const e of posted) {
      if (e.cType === "LN" && e.bIsPaid === true && e.nLoanId != null) {
        paidCounts.set(e.nLoanId, (paidCounts.get(e.nLoanId) || 0) + 1);
      }
    }
    const loanRows = loans.map((l) => ({
      ...l,
      paidCount: paidCounts.get(l.nLoanId) ?? 0,
      outstanding: loanOutstanding(l, paidCounts.get(l.nLoanId) ?? 0),
    }));
    const loanOutstandingTotal = loanRows.reduce((s, l) => s + l.outstanding, 0);
    const activeLoans = loanRows.filter((l) => l.cStatus !== "PAID");

    /* Loanable: how much more can still be borrowed against the loan
       accounts' limits — limit − outstanding principal of their loans
       (interest excluded). */
    const loanable = accounts
      .filter((a) => a.cAccountType === "LOAN")
      .reduce((s, a) => {
        const limit = Number(a.dCreditLimit || 0);
        if (!(limit > 0)) return s;
        const borrowed = loanRows
          .filter((l) => l.nAccountId === a.nAccountId)
          .reduce((sum, l) => sum + l.outstanding, 0);
        return s + Math.max(0, limit - borrowed);
      }, 0);

    /* ── Bills: unpaid obligations — loan installments (LN) and unpaid
          credit-card charges (PRC) — grouped by when they fall due. ── */
    const today = new Date().toISOString().slice(0, 10);
    const accountNames = Object.fromEntries(
      accounts.map((a) => [a.nAccountId, a.strName])
    );
    const loanNames = Object.fromEntries(loans.map((l) => [l.nLoanId, l.strName]));
    const bills = posted
      .filter((e) => (e.cType === "LN" || e.cType === "PRC") && e.bIsPaid !== true)
      .map((e) => ({
        nLedgerId: e.nLedgerId,
        kind: e.cType,
        /* LN bills link to their loan, PRC bills to their card. */
        linkId: e.cType === "LN" ? e.nLoanId : e.nAccountId,
        date: String(e.dTransactionDate).slice(0, 10),
        amount: Number(e.dAmount || 0) + Number(e.dFee || 0),
        label:
          e.cType === "LN"
            ? loanNames[e.nLoanId] || "Loan installment"
            : accountNames[e.nAccountId] || "Credit card charge",
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
    const overdueBills = bills.filter((b) => b.date < today);
    const dueThisMonthBills = bills.filter(
      (b) => b.date >= today && b.date.slice(0, 7) === prefix
    );
    const upcomingBills = bills.filter((b) => b.date > today && b.date.slice(0, 7) !== prefix);
    const sumBills = (list) => list.reduce((s, b) => s + b.amount, 0);

    /* ── Accounts: every account with its live balance — same helpers
          as the Accounts page (liquid cash flow, credit available,
          loan credit). ── */
    const accountRows = accounts
      .map((a) => ({
        ...a,
        dBalance:
          a.cAccountType === "CREDIT"
            ? creditBalance(a, entries)
            : a.cAccountType === "LOAN"
              ? loanCreditBalance(a, loans, paidCounts)
              : accountBalance(a, entries),
      }))
      .sort(
        (a, b) =>
          String(ACCOUNT_META[a.cAccountType]?.label || a.cAccountType).localeCompare(
            String(ACCOUNT_META[b.cAccountType]?.label || b.cAccountType)
          ) || String(a.strName).localeCompare(String(b.strName))
      );

    /* ── Top spending categories this month ── */
    const byCategory = new Map();
    for (const e of monthRows) {
      if (!["OUT", "PRC", "PAY"].includes(e.cType)) continue;
      const key = e.nCategoryId ?? "none";
      byCategory.set(key, (byCategory.get(key) || 0) + Number(e.dAmount || 0) + Number(e.dFee || 0));
    }
    const topCategories = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id, total]) => ({
        name: id === "none" ? "Uncategorized" : categoryMap[id] || "Unknown",
        total,
        share: monthOut > 0 ? total / monthOut : 0,
      }));

    return {
      liquidAccounts,
      currentBalance,
      monthIn,
      monthOut,
      monthTransferTotal,
      monthCount: monthRows.length,
      monthInCount,
      creditLimitTotal,
      creditCardCount,
      creditsUsed,
      loanable,
      loanOutstandingTotal,
      activeLoans,
      bills,
      overdueBills,
      dueThisMonthBills,
      upcomingBills,
      sumBills,
      today,
      topCategories,
      loanRows,
      accountRows,
    };
  }, [accounts, entries, loans, categoryMap]);

  const masked = (value) => (hidden ? "₱ ••••••" : value);

  const statCards = [
    {
      label: "In This Month",
      value: metrics.monthIn,
      color: "#2e7d32",
      Icon: InIcon,
      caption: metrics.monthInCount > 0
        ? `across ${metrics.monthInCount} income entr${metrics.monthInCount === 1 ? "y" : "ies"}`
        : "No income recorded this month",
    },
    {
      label: "Out This Month",
      value: metrics.monthOut,
      color: "#d32f2f",
      Icon: DownIcon,
      caption: metrics.monthTransferTotal > 0 ? `+ ${masked(peso(metrics.monthTransferTotal))} moved between accounts` : "Transfers excluded — internal moves",
    },
    {
      label: "Available Loanable",
      value: metrics.loanable,
      color: "#e65100",
      Icon: LoanIcon,
      caption: `Loan outstanding: ${masked(peso(metrics.loanOutstandingTotal))} · ${metrics.activeLoans.length} active`,
    },
    {
      label: "Credits Used",
      value: metrics.creditsUsed,
      color: "#7b1fa2",
      Icon: CreditIcon,
      caption:
        metrics.creditLimitTotal > 0
          ? `of ${masked(peso(metrics.creditLimitTotal))} limit across ${metrics.creditCardCount} card${metrics.creditCardCount === 1 ? "" : "s"}`
          : metrics.creditCardCount === 0
            ? "No credit cards yet"
            : "No credit limits set",
    },
  ];

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      <Stack spacing={2}>
        {/* ── HERO — Current Balance (cash, bank, debit, e-wallets) ── */}
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 4,
            p: { xs: 2.5, sm: 3.5 },
            /* Deep green gradient — money/wealth feel, white text in
               both themes so it never inherits the dusty blue accent. */
            background: "linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%)",
            color: "#ffffff",
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
                sx={{ fontWeight: 500, fontSize: "0.82rem", letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.85 }}
              >
                Current Balance
              </Typography>
            </Stack>
            <Tooltip title={hidden ? "Show amounts" : "Hide amounts"}>
              <IconButton
                size="small"
                onClick={() => setHidden((prev) => !prev)}
                aria-label={hidden ? "Show amounts" : "Hide amounts"}
                sx={{ color: "inherit", "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.15)" } }}
              >
                {hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          {loading ? (
            <Skeleton variant="text" width={220} sx={{ mt: 1, backgroundColor: "rgba(255,255,255,0.3)" }} />
          ) : (
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
              {masked(peso(metrics.currentBalance))}
            </Typography>
          )}
          <Typography variant="caption" sx={{ position: "relative", display: "block", opacity: 0.8, mt: 0.5 }}>
            Cash, bank, debit & e-wallet accounts — credit cards and loans excluded
          </Typography>
        </Box>

        {/* ── METRIC GRID ── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
            gap: 1.5,
          }}
        >
          {statCards.map((stat) => (
            <Box
              key={stat.label}
              sx={{
                p: 1.5,
                border: "1px solid var(--border-light)",
                borderRadius: 3,
                backgroundColor: "var(--card-bg)",
              }}
            >
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.75 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `color-mix(in srgb, ${stat.color} 14%, transparent)`,
                    color: stat.color,
                    "& svg": { fontSize: 14 },
                  }}
                >
                  <stat.Icon />
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
                >
                  {stat.label}
                </Typography>
              </Stack>
              <Typography
                variant="body1"
                sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}
              >
                {loading ? <Skeleton width={110} /> : masked(peso(stat.value))}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", mt: 0.5, lineHeight: 1.3 }}>
                {stat.caption}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* ── ROW: Loans + Top categories ── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 1.5,
            alignItems: "start",
          }}
        >
        {/* ── LOANS — per-loan progress rows ── */}
        <Box
          sx={{
            p: 1.5,
            border: "1px solid var(--border-light)",
            borderRadius: 3,
            backgroundColor: "var(--card-bg)",
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.25 }}>
            <LoanIcon sx={{ fontSize: 16, color: "#e65100" }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
              Loans
            </Typography>
          </Stack>

          {/* Per-loan progress rows. */}
          <Stack spacing={0.75} sx={{ maxHeight: 160, overflowY: "auto" }}>
              {loading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height={38} />)
              ) : metrics.loanRows.length === 0 ? (
                <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic", py: 1 }}>
                  No loans yet — add one on the Loans page.
                </Typography>
              ) : (
                metrics.loanRows.slice(0, 5).map((l) => {
                  const term = Number(l.nTermMonths) || 0;
                  const pct = term > 0 ? Math.min(100, Math.round((l.paidCount / term) * 100)) : 0;
                  return (
                    <Box
                      key={l.nLoanId}
                      onClick={() => navigate(`/loans?open=${l.nLoanId}`)}
                      sx={{
                        p: 1,
                        border: "1px solid var(--border-light)",
                        borderRadius: 2,
                        backgroundColor: "var(--bg-secondary)",
                        cursor: "pointer",
                        "&:hover": { borderColor: "var(--accent)" },
                      }}
                    >
                      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                          <RowIcon icon={<LoanIcon />} color={l.cStatus === "PAID" ? "#1565c0" : "#e65100"} />
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {l.strName || "—"}
                            {l.cStatus === "PAID" && (
                              <Box component="span" sx={{ ml: 0.75, color: "#1565c0" }}>
                                · Completed
                              </Box>
                            )}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: "var(--text-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {l.paidCount}/{term || "—"} · {masked(peso(l.outstanding))}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: "var(--border-light)",
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: l.cStatus === "PAID" ? "#1565c0" : "#e65100",
                          },
                        }}
                      />
                    </Box>
                  );
                })
              )}
          </Stack>
        </Box>

          {/* TOP CATEGORIES THIS MONTH */}
          <Box
            sx={{
              p: 1.5,
              border: "1px solid var(--border-light)",
              borderRadius: 3,
              backgroundColor: "var(--card-bg)",
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.25 }}>
              <ReceiptIcon sx={{ fontSize: 16, color: "var(--accent)" }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
                Top Categories · This Month
              </Typography>
            </Stack>

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={38} />)
            ) : metrics.topCategories.length === 0 ? (
              <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic", py: 1, display: "block" }}>
                No spending recorded this month yet.
              </Typography>
            ) : (
              <Stack spacing={0.75} sx={{ maxHeight: 160, overflowY: "auto" }}>
                {metrics.topCategories.map((cat) => (
                  <Box
                    key={cat.name}
                    sx={{
                      p: 1,
                      border: "1px solid var(--border-light)",
                      borderRadius: 2,
                      backgroundColor: "var(--bg-secondary)",
                    }}
                  >
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                        <RowIcon icon={<CategoryIcon />} color="var(--accent)" />
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {cat.name}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {masked(peso(cat.total))} · {Math.round(cat.share * 100)}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.round(cat.share * 100)}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: "var(--border-light)",
                        "& .MuiLinearProgress-bar": { backgroundColor: "var(--accent)" },
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Box>

        {/* ── ROW: Bills + Accounts ── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 1.5,
            alignItems: "start",
          }}
        >
          {/* BILLS — unpaid loan installments + credit-card charges,
              grouped by when they fall due. */}
          <Box
            sx={{
              p: 1.5,
              border: "1px solid var(--border-light)",
              borderRadius: 3,
              backgroundColor: "var(--card-bg)",
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.25 }}>
              <BillsIcon sx={{ fontSize: 16, color: "#d97706" }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
                Bills
              </Typography>
            </Stack>

            {/* Overdue / due this month / upcoming totals. */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, mb: 1.25 }}>
              {[
                {
                  label: "Overdue",
                  list: metrics.overdueBills,
                  color: metrics.overdueBills.length > 0 ? "#d32f2f" : "var(--text-primary)",
                },
                { label: "Due this month", list: metrics.dueThisMonthBills, color: "#d97706" },
                { label: "Upcoming", list: metrics.upcomingBills, color: "var(--text-primary)" },
              ].map((stat) => (
                <Box key={stat.label}>
                  <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)" }}>
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: stat.color }}
                  >
                    {loading ? <Skeleton width={70} /> : masked(peso(metrics.sumBills(stat.list)))}
                  </Typography>
                  <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.3 }}>
                    {stat.list.length} bill{stat.list.length === 1 ? "" : "s"}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Next bills in date order — tap one to open its loan / card. */}
            <Stack spacing={0.75} sx={{ maxHeight: 160, overflowY: "auto" }}>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={34} />)
              ) : metrics.bills.length === 0 ? (
                <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic", py: 1 }}>
                  No unpaid bills — all settled.
                </Typography>
              ) : (
                metrics.bills.slice(0, 6).map((b) => (
                  <Box
                    key={b.nLedgerId}
                    onClick={() =>
                      navigate(b.kind === "LN" ? `/loans?open=${b.linkId}` : `/accounts?open=${b.linkId}`)
                    }
                    sx={{
                      p: 1,
                      border: "1px solid var(--border-light)",
                      borderRadius: 2,
                      backgroundColor: "var(--bg-secondary)",
                      cursor: "pointer",
                      "&:hover": { borderColor: "var(--accent)" },
                    }}
                  >
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                        <RowIcon icon={b.kind === "LN" ? <LoanIcon /> : <CreditIcon />} color={b.kind === "LN" ? "#e65100" : "#d97706"} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            sx={{ display: "block", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {b.label}
                          </Typography>
                          <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.3 }}>
                            {b.date} · {b.kind === "LN" ? "Loan" : "Card"}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{
                          color: b.date < metrics.today ? "#d32f2f" : "var(--text-primary)",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          flexShrink: 0,
                        }}
                      >
                        {masked(peso(b.amount))}
                      </Typography>
                    </Stack>
                  </Box>
                ))
              )}
            </Stack>
          </Box>

          {/* ACCOUNTS — simple top-level metrics: Balance, Credit,
              Loan, Overdue. */}
          <Box
            sx={{
              p: 1.5,
              border: "1px solid var(--border-light)",
              borderRadius: 3,
              backgroundColor: "var(--card-bg)",
            }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.25 }}>
              <WalletIcon sx={{ fontSize: 16, color: "#1565c0" }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--text-primary)" }}>
                Accounts
              </Typography>
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
                gap: 1,
              }}
            >
              {[
                {
                  label: "Balance",
                  value: metrics.currentBalance,
                  color: "var(--text-primary)",
                  sub: `${metrics.liquidAccounts.length} liquid account${metrics.liquidAccounts.length === 1 ? "" : "s"}`,
                },
                {
                  label: "Credit",
                  value: metrics.creditsUsed,
                  color: "var(--text-primary)",
                  sub:
                    metrics.creditLimitTotal > 0
                      ? `of ${masked(peso(metrics.creditLimitTotal))} limit`
                      : `${metrics.creditCardCount} card${metrics.creditCardCount === 1 ? "" : "s"}`,
                },
                {
                  label: "Loan",
                  value: metrics.loanOutstandingTotal,
                  color: "var(--text-primary)",
                  sub: `${metrics.activeLoans.length} active loan${metrics.activeLoans.length === 1 ? "" : "s"}`,
                },
                {
                  label: "Overdue",
                  value: metrics.sumBills(metrics.overdueBills),
                  color: metrics.overdueBills.length > 0 ? "#d32f2f" : "var(--text-primary)",
                  sub: `${metrics.overdueBills.length} bill${metrics.overdueBills.length === 1 ? "" : "s"}`,
                },
              ].map((stat) => (
                <Box key={stat.label}>
                  <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)" }}>
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: stat.color }}
                  >
                    {loading ? <Skeleton width={70} /> : masked(peso(stat.value))}
                  </Typography>
                  <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.3 }}>
                    {stat.sub}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Per-account rows — live balance per account, tap to open.
                Uses the same helpers as the Accounts page (liquid cash
                flow, credit available, loan credit). */}
            <Stack spacing={0.75} sx={{ mt: 1.25, maxHeight: 160, overflowY: "auto" }}>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={34} />)
              ) : metrics.accountRows.length === 0 ? (
                <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic", py: 1 }}>
                  No accounts yet — add one on the Accounts page.
                </Typography>
              ) : (
                metrics.accountRows.map((a) => {
                  const meta = ACCOUNT_META[a.cAccountType] || {
                    label: a.cAccountType,
                    color: "var(--text-muted)",
                    Icon: WalletIcon,
                  };
                  return (
                    <Box
                      key={a.nAccountId}
                      onClick={() => navigate(`/accounts?open=${a.nAccountId}`)}
                      sx={{
                        p: 1,
                        border: "1px solid var(--border-light)",
                        borderRadius: 2,
                        backgroundColor: "var(--bg-secondary)",
                        cursor: "pointer",
                        "&:hover": { borderColor: "var(--accent)" },
                      }}
                    >
                      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                          <Box
                            aria-hidden
                            sx={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                              color: meta.color,
                              "& svg": { fontSize: 14 },
                              flexShrink: 0,
                            }}
                          >
                            <meta.Icon />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="caption"
                              sx={{ display: "block", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {a.strName || "—"}
                            </Typography>
                            <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.3 }}>
                              {meta.label}
                              {a.strInstitution ? ` · ${a.strInstitution}` : ""}
                            </Typography>
                          </Box>
                        </Stack>
                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              color: Number(a.dBalance) < 0 ? "#d32f2f" : "var(--text-primary)",
                            }}
                          >
                            {masked(peso(a.dBalance))}
                          </Typography>
                          {/* Credit/Loan rows show the limit under the
                              balance — value only, like the Accounts page. */}
                          {(a.cAccountType === "CREDIT" || a.cAccountType === "LOAN") &&
                            Number(a.dCreditLimit) > 0 && (
                              <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.3 }}>
                                {masked(peso(a.dCreditLimit))}
                              </Typography>
                            )}
                        </Box>
                      </Stack>
                    </Box>
                  );
                })
              )}
            </Stack>
          </Box>
        </Box>
      </Stack>
      {toastNode}
    </Box>
  );
}
