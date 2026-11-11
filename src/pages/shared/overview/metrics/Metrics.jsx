import { useEffect, useMemo, useState } from "react";
import { Box, ButtonBase, Skeleton, Stack, Typography } from "@mui/material";
import {
  AccountBalance as LoanIcon,
  CreditCard as CardIcon,
  ReceiptLong as TransactionsIcon,
  Savings as SavingIcon,
  ShowChart as MetricsIcon,
} from "@mui/icons-material";
import { transactionService } from "../../../../services/transactionService";
import { loanService } from "../../../../services/loanService";
import { cardService } from "../../../../services/cardService";
import { savingService } from "../../../../services/savingService";
import {
  CARD_DEDUCTION_MARKERS,
  computeCardsStats,
  computeLoanStats,
  computeSavingsStats,
  computeTransactionStats,
} from "../../../../lib/kpiStats";

/* ₱ amounts — change the locale/currency here if you need another one. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

const percent = (value) => `${Math.round((Number(value) || 0) * 10) / 10}%`;

/* Same codes as the transactions table: I income, E expense, B
   purchase (card spending), P payment (loan installment), S savings
   deposit. */
const TYPE_META = {
  I: { label: "Income", color: "#2e7d32" },
  E: { label: "Expense", color: "#f44336" },
  B: { label: "Purchase", color: "#ed6c02" },
  P: { label: "Payment", color: "#7b1fa2" },
  S: { label: "Savings", color: "#00838f" },
};

const panelSx = {
  border: "1px solid var(--border-medium)",
  borderRadius: 3,
  backgroundColor: "var(--card-bg)",
  overflow: "hidden",
  p: { xs: 2, sm: 2.5 },
};

/* Section heading — same reduced weight/size as the dashboard's. */
function SectionHeader({ icon, title }) {
  const HeaderIcon = icon;
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.25 }}>
      <Box sx={{ color: "var(--accent)", display: "flex" }}>
        <HeaderIcon sx={{ fontSize: 18 }} />
      </Box>
      <Typography
        variant="subtitle2"
        component="div"
        sx={{
          fontWeight: 500,
          fontSize: "0.82rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-primary)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {title}
      </Typography>
    </Stack>
  );
}

/* One figure: small label, the number, an optional hint under it. */
function Stat({ label, value, hint, color }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          display: "block",
          mt: 0.5,
          fontWeight: 700,
          fontSize: "1.1rem",
          color: color || "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "var(--text-muted)", mt: 0.25 }}
        >
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/* Stat grid — 2-up on phones, 4-up from sm. */
function StatGrid({ children }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: { xs: 2, sm: 2.5 },
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(4, minmax(0, 1fr))",
        },
      }}
    >
      {children}
    </Box>
  );
}

/* Progress bar used by the rates (collection rate, savings rate…). */
function RateBar({ value, color }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <Box
      sx={{
        mt: 1,
        height: 6,
        borderRadius: 99,
        backgroundColor: "var(--bg-secondary)",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: `${clamped}%`,
          height: "100%",
          borderRadius: 99,
          backgroundColor: color || "var(--accent)",
        }}
      />
    </Box>
  );
}

/**
 * Metrics — the read-only report the METRICS button opens in place of
 * the dashboard (the dashboard passes `onBack` to return).
 *
 * It covers everything the four tabs sum up: transactions (balance,
 * month flow, per-type breakdown, a 6-month income/expense chart),
 * loans (collected/to-collect, rates, overdue), savings (funds,
 * deposits) and cards (debit balances, credit outstanding, charges).
 * All numbers come from the same kpiStats helpers the tab pages use,
 * over the same list endpoints — nothing is recomputed differently.
 */
export default function Metrics({ onBack }) {
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [cards, setCards] = useState([]);
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [tx, ln, cd, sv] = await Promise.allSettled([
        transactionService.list(),
        loanService.list(),
        cardService.list(),
        savingService.list(),
      ]);
      if (!alive) return;
      if (tx.status === "fulfilled") setTransactions(tx.value || []);
      else {
        console.error("Error fetching transactions for metrics:", tx.reason);
        setLoadError(true);
      }
      if (ln.status === "fulfilled") setLoans(ln.value || []);
      else console.error("Error fetching loans for metrics:", ln.reason);
      if (cd.status === "fulfilled") setCards(cd.value || []);
      else console.error("Error fetching cards for metrics:", cd.reason);
      if (sv.status === "fulfilled") setSavings(sv.value || []);
      else console.error("Error fetching savings for metrics:", sv.reason);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const txnStats = useMemo(
    () => computeTransactionStats(transactions),
    [transactions]
  );
  const loanStats = useMemo(() => computeLoanStats(loans), [loans]);
  const savingsStats = useMemo(() => computeSavingsStats(savings), [savings]);
  const cardsStats = useMemo(() => computeCardsStats(cards), [cards]);

  /* Entries and amount per transaction type (B included here — the
     metrics report shows what the ledger holds, purchases included). */
  const typeBreakdown = useMemo(() => {
    const rows = Object.entries(TYPE_META).map(([type, meta]) => ({
      type,
      label: meta.label,
      color: meta.color,
      count: 0,
      amount: 0,
    }));
    const byType = new Map(rows.map((r) => [r.type, r]));
    for (const t of transactions) {
      const row = byType.get(t.cType);
      if (!row) continue;
      row.count += 1;
      row.amount += Number(t.dAmount) || 0;
    }
    return rows;
  }, [transactions]);

  /* Last six months of income vs expense — same "this month" rules as
     computeTransactionStats (B skipped, card-paid companions skipped). */
  const monthly = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("en-PH", { month: "short" }),
        income: 0,
        expense: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const t of transactions) {
      if (!t.dttCreated) continue;
      if (t.cType === "B") continue;
      if (
        t.cType === "E" &&
        t.nCardId &&
        CARD_DEDUCTION_MARKERS.includes(t.strDescription)
      )
        continue; // card-paid companion — its own entry carries the money
      const created = new Date(t.dttCreated);
      const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
      if (!bucket) continue;
      const amount = Number(t.dAmount) || 0;
      if (t.cType === "I") bucket.income += amount;
      else if (t.cType === "E" || t.cType === "P" || t.cType === "S")
        bucket.expense += amount;
    }
    return months;
  }, [transactions]);

  const chartMax = useMemo(
    () => Math.max(1, ...monthly.flatMap((m) => [m.income, m.expense])),
    [monthly]
  );

  const maxTypeAmount = useMemo(
    () => Math.max(1, ...typeBreakdown.map((r) => r.amount)),
    [typeBreakdown]
  );

  if (loading) {
    return (
      <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
        <Skeleton sx={{ width: 160, height: 24, mb: 3 }} />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            sx={{ width: "100%", height: 140, mb: 2.5 }}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      <Stack
        direction="row"
        sx={{
          mb: 3,
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <MetricsIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
          {/* Breadcrumb — DASHBOARD takes you back, METRICS is where you are. */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <ButtonBase
              onClick={onBack}
              aria-label="Back to Dashboard"
              sx={{
                fontWeight: 500,
                fontSize: "0.82rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif",
                borderRadius: 1,
                px: 0.5,
                "&:hover": {
                  color: "var(--accent)",
                  backgroundColor: "var(--overlay-dark)",
                },
              }}
            >
              Dashboard
            </ButtonBase>
            <Typography
              component="span"
              variant="subtitle2"
              sx={{
                fontWeight: 500,
                fontSize: "0.82rem",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              /
            </Typography>
            <Typography
              component="span"
              variant="subtitle2"
              sx={{
                fontWeight: 500,
                fontSize: "0.82rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-primary)",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Metrics
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      {loadError ? (
        <Typography variant="body2" sx={{ color: "#f44336", mb: 2 }}>
          Some data couldn't be loaded — the figures below may be incomplete.
        </Typography>
      ) : null}

      <Stack spacing={3}>
        {/* ---- Overview ---- */}
        <Box>
          <SectionHeader icon={MetricsIcon} title="Overview" />
          <Box sx={panelSx}>
            <StatGrid>
              <Stat
                label="Total Balance"
                value={money(txnStats.balance)}
                hint="Income minus expenses"
              />
              <Stat
                label="This Month"
                value={money(txnStats.monthIncome - txnStats.monthExpense)}
                hint="Net this month"
                color={
                  txnStats.monthIncome - txnStats.monthExpense < 0
                    ? "#f44336"
                    : undefined
                }
              />
              <Stat
                label="Net Margin"
                value={percent(txnStats.margin)}
                hint="Balance as share of income"
              />
              <Stat
                label="Savings Rate"
                value={percent(txnStats.savingsRate)}
                hint="Set aside as share of income"
              />
            </StatGrid>
          </Box>
        </Box>

        {/* ---- Transactions ---- */}
        <Box>
          <SectionHeader icon={TransactionsIcon} title="Transactions" />
          <Box sx={panelSx}>
            <StatGrid>
              <Stat label="Income" value={money(txnStats.income)} color="#2e7d32" />
              <Stat label="Expense" value={money(txnStats.expense)} color="#f44336" />
              <Stat
                label="Month Income"
                value={money(txnStats.monthIncome)}
                hint={`Expense ${money(txnStats.monthExpense)}`}
              />
              <Stat label="Set Aside" value={money(txnStats.saved)} hint="Savings deposits" />
            </StatGrid>

            {/* Income vs expense, last six months. */}
            <Box sx={{ mt: 3 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", mb: 1 }}
              >
                <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                  Last 6 months
                </Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#2e7d32" }} />
                    <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                      Income
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f44336" }} />
                    <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                      Expense
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
              <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 } }}>
                {monthly.map((m) => (
                  <Stack
                    key={m.key}
                    spacing={0.75}
                    sx={{ flex: 1, minWidth: 0, alignItems: "center" }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.75}
                      sx={{
                        alignItems: "flex-end",
                        justifyContent: "center",
                        height: 110,
                        width: "100%",
                      }}
                    >
                      <Box
                        title={`Income ${money(m.income)}`}
                        sx={{
                          width: { xs: 8, sm: 12 },
                          height: `${(m.income / chartMax) * 100}%`,
                          minHeight: m.income > 0 ? 3 : 0,
                          borderRadius: 1,
                          backgroundColor: "#2e7d32",
                        }}
                      />
                      <Box
                        title={`Expense ${money(m.expense)}`}
                        sx={{
                          width: { xs: 8, sm: 12 },
                          height: `${(m.expense / chartMax) * 100}%`,
                          minHeight: m.expense > 0 ? 3 : 0,
                          borderRadius: 1,
                          backgroundColor: "#f44336",
                        }}
                      />
                    </Stack>
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--text-muted)", fontSize: "0.65rem" }}
                    >
                      {m.label}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Box>

            {/* What the ledger is made of, per type. */}
            <Box sx={{ mt: 3, display: "grid", gap: 1.5 }}>
              {typeBreakdown.map((row) => (
                <Box key={row.type}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", alignItems: "baseline" }}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: row.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ color: "var(--text-primary)" }}>
                        {row.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                        {row.count} {row.count === 1 ? "entry" : "entries"}
                      </Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: row.color,
                      }}
                    >
                      {money(row.amount)}
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      mt: 0.5,
                      height: 5,
                      borderRadius: 99,
                      backgroundColor: "var(--bg-secondary)",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: `${(row.amount / maxTypeAmount) * 100}%`,
                        height: "100%",
                        borderRadius: 99,
                        backgroundColor: row.color,
                        opacity: 0.75,
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* ---- Loans ---- */}
        <Box>
          <SectionHeader icon={LoanIcon} title="Loans" />
          <Box sx={panelSx}>
            <StatGrid>
              <Stat
                label="Collected"
                value={money(loanStats.collected)}
                hint="Installments settled"
                color="#2e7d32"
              />
              <Stat
                label="To Collect"
                value={money(loanStats.toCollect)}
                hint={`Across ${loanStats.active} active`}
              />
              <Stat label="Disbursed" value={money(loanStats.disbursed)} hint="Active + completed" />
              <Stat
                label="Overdue"
                value={loanStats.overdue}
                hint={
                  loanStats.overdue > 0
                    ? `${loanStats.overdueLoans} loan${loanStats.overdueLoans === 1 ? "" : "s"} affected`
                    : "Nothing past due"
                }
                color={loanStats.overdue > 0 ? "#f44336" : undefined}
              />
            </StatGrid>

            <Box sx={{ mt: 3 }}>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", alignItems: "baseline" }}
              >
                <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                  Collection rate
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {percent(loanStats.collectedRate)}
                </Typography>
              </Stack>
              <RateBar value={loanStats.collectedRate} />
            </Box>

            <Box sx={{ mt: 2 }}>
              <StatGrid>
                <Stat label="Active" value={loanStats.active} hint={money(loanStats.activePrincipal) + " principal"} />
                <Stat label="Pending" value={loanStats.pending} hint="Not handed out yet" />
                <Stat label="Collected" value={percent(loanStats.collectedRate)} hint="Of what's disbursed" />
                <Stat label="Outstanding" value={money(loanStats.toCollect)} hint="Still to come in" />
              </StatGrid>
            </Box>
          </Box>
        </Box>

        {/* ---- Savings ---- */}
        <Box>
          <SectionHeader icon={SavingIcon} title="Savings" />
          <Box sx={panelSx}>
            <StatGrid>
              <Stat
                label="Fund Balance"
                value={money(savingsStats.balance)}
                hint={`Across ${savingsStats.funds} fund${savingsStats.funds === 1 ? "" : "s"}`}
              />
              <Stat label="Active Funds" value={money(savingsStats.activeBalance)} hint={`${savingsStats.active} active`} />
              <Stat label="Deposits" value={savingsStats.deposits} hint={`${savingsStats.pending} fund${savingsStats.pending === 1 ? "" : "s"} pending`} />
              <Stat label="Avg Deposit" value={money(savingsStats.avgDeposit)} hint="Per deposit" />
            </StatGrid>
          </Box>
        </Box>

        {/* ---- Cards ---- */}
        <Box>
          <SectionHeader icon={CardIcon} title="Cards" />
          <Box sx={panelSx}>
            <StatGrid>
              <Stat label="Debit Balances" value={money(cardsStats.debitBalance)} hint={`${cardsStats.debit} debit card${cardsStats.debit === 1 ? "" : "s"}`} />
              <Stat
                label="Credit Owed"
                value={money(cardsStats.creditOutstanding)}
                hint={`${cardsStats.credit} credit card${cardsStats.credit === 1 ? "" : "s"}`}
                color={cardsStats.creditOutstanding > 0 ? "#f44336" : undefined}
              />
              <Stat label="Available Credit" value={money(cardsStats.availableCredit)} hint="Limits minus owed" color="#2e7d32" />
              <Stat label="Card Charges" value={money(cardsStats.charges)} hint={`${cardsStats.total} card${cardsStats.total === 1 ? "" : "s"} total`} />
            </StatGrid>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
