import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, IconButton, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import {
  AccountBalance as LoanIcon,
  AccountBalanceWallet as BalanceIcon,
  Add as AddIcon,
  BarChart as MetricsIcon,
  CreditCard as CardIcon,
  Payments as PaymentIcon,
  PieChart as BudgetingIcon,
  Receipt as BillsIcon,
  ReceiptLong as TransactionsIcon,
  Savings as SavingIcon,
  ShoppingCart as PurchaseIcon,
  TrendingDown as ExpenseIcon,
  TrendingUp as IncomeIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import { transactionService } from "../../../../services/transactionService";
import { loanService } from "../../../../services/loanService";
import { cardService } from "../../../../services/cardService";
import { savingService } from "../../../../services/savingService";
import { computeTransactionStats } from "../../../../lib/kpiStats";
import { buildBills, isOverdue, isThisMonth } from "../../../../lib/bills";
import { fmtDay } from "../../../../lib/loanSchedule";
import { isFavorite } from "../../../../lib/cards";
import BankCardFace from "../../../../components/ui/BankCardFace";
import Metrics from "../metrics/Metrics";
import Bills from "../bills/Bills";
import BudgetPlans from "../budget-plans/BudgetPlans";

/* ₱ amounts — change the locale/currency here if you need another one. */
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

/* Type colours / icons for the recent list — same codes as the
   transactions table (I income, E expense, B purchase, P payment,
   S savings deposit). */
const TYPE_META = {
  I: { label: "Income", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)", icon: IncomeIcon },
  E: { label: "Expense", color: "#f44336", bg: "rgba(244, 67, 54, 0.14)", icon: ExpenseIcon },
  B: { label: "Purchase", color: "#ed6c02", bg: "rgba(237, 108, 2, 0.14)", icon: PurchaseIcon },
  P: { label: "Payment", color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.14)", icon: PaymentIcon },
  S: { label: "Savings", color: "#00838f", bg: "rgba(0, 131, 143, 0.14)", icon: SavingIcon },
};

/* Quick-action shortcuts under the balance — plain links to their
   pages (Purchase lives on the Transactions page as a type "B" row,
   so it lands there with the type filter preselected). */
const SHORTCUTS = [
  { label: "TRANSACTION", icon: AddIcon, to: "/income-expense" },
  { label: "PURCHASE", icon: PurchaseIcon, to: "/income-expense?type=B" },
  { label: "LOANS", icon: LoanIcon, to: "/loans" },
  { label: "SAVINGS", icon: SavingIcon, to: "/savings" },
  { label: "CARDS", icon: CardIcon, to: "/cards" },
];

/* Shared style for the shortcut buttons — both rows in the card. */
const shortcutBtnSx = {
  boxSizing: "border-box",
  height: 40,
  minHeight: 40,
  minWidth: 0,
  justifyContent: "center",
  borderColor: "var(--border-medium)",
  backgroundColor: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: "0.78rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  borderRadius: 3,
  px: { xs: 0.5, sm: 1 },
  whiteSpace: "nowrap",
  overflow: "hidden",
  "& .MuiButton-startIcon": { mr: { xs: 0, sm: 0.75 } },
  "&:hover": {
    borderColor: "var(--accent)",
    backgroundColor: "var(--bg-secondary)",
  },
};

/* Dashboard rows stay short — three each so the page doesn't run long
   (full lists live on their own pages). */
const LOAN_LIMIT = 3;
const SAVINGS_LIMIT = 3;
const RECENT_LIMIT = 3;
const BILLS_LIMIT = 3;

/* Shared panel the row sections (savings, loans, recent) sit in. */
const panelSx = {
  border: "1px solid var(--border-medium)",
  borderRadius: 3,
  backgroundColor: "var(--card-bg)",
  overflow: "hidden",
};

/* "ACTIVE LOANS" heading with an optional "View all" link — the three
   row sections below the shortcuts all share it. `icon` is the
   component itself; it is named inside the body so core ESLint (which
   does not read JSX references) can see the prop being used. */
function SectionHeader({ icon, title, onViewAll }) {
  const HeaderIcon = icon;
  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
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
      {onViewAll && (
        <Button
          size="small"
          onClick={onViewAll}
          sx={{
            color: "var(--accent)",
            fontWeight: 600,
            textTransform: "none",
            "&:hover": { backgroundColor: "var(--overlay-dark)" },
          }}
        >
          View all
        </Button>
      )}
    </Stack>
  );
}

/* One dashboard row: tinted circle icon, title + caption, right-aligned
   amount + caption — the shape shared by Active Loans and Recent
   Transactions. */
function RowShell({ icon, iconColor, iconBg, title, caption, amount, amountColor, footer }) {
  const RowIcon = icon;
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        alignItems: "center",
        py: 1.5,
        px: { xs: 1.5, sm: 2 },
        borderTop: "1px solid var(--border-light)",
        "&:hover": { backgroundColor: "var(--overlay-dark)" },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: iconBg,
          color: iconColor,
        }}
      >
        <RowIcon sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
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
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {caption}
        </Typography>
      </Box>
      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
        <Typography variant="body2" sx={{ color: amountColor, fontWeight: 700 }}>
          {amount}
        </Typography>
        <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)" }}>
          {footer}
        </Typography>
      </Box>
    </Stack>
  );
}

/* A row of N skeleton lines for the row sections. */
function RowSkeletons({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Stack
          key={i}
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", py: 1.5, px: { xs: 1.5, sm: 2 } }}
        >
          <Skeleton variant="circular" width={36} height={36} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="45%" />
            <Skeleton variant="text" width="30%" />
          </Box>
          <Skeleton variant="text" width={90} />
        </Stack>
      ))}
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [cards, setCards] = useState([]);
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loansLoading, setLoansLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /* Entries behind the My Bills section: loan schedules + card purchase
     repayments, fetched once the loans/cards lists are in. */
  const [billEntries, setBillEntries] = useState({
    loanEntries: new Map(),
    cardEntries: new Map(),
  });
  const [billsLoading, setBillsLoading] = useState(true);
  /* E-wallet style: the amount starts hidden behind the eye toggle. */
  const [hidden, setHidden] = useState(true);
  /* METRICS swaps the whole dashboard body for the Metrics report. */
  const [showMetrics, setShowMetrics] = useState(false);
  /* BILLS swaps it for the billed/unbilled report. */
  const [showBills, setShowBills] = useState(false);
  /* BUDGET PLANS swaps it for the budget-plan management page. */
  const [showBudgetPlans, setShowBudgetPlans] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await transactionService.list();
        if (alive) setTransactions(data || []);
      } catch (err) {
        console.error("Error fetching transactions for the dashboard:", err);
        if (alive) setLoadError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* Loans, cards and savings only decorate their sections — a failure
     here is logged, not toasted, so the rest of the dashboard still
     renders. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await loanService.list();
        if (alive) setLoans(data || []);
      } catch (err) {
        console.error("Error fetching loans for the dashboard:", err);
      } finally {
        if (alive) setLoansLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await savingService.list();
        if (alive) setSavings(data || []);
      } catch (err) {
        console.error("Error fetching savings for the dashboard:", err);
      } finally {
        if (alive) setSavingsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await cardService.list();
        if (alive) setCards(data || []);
      } catch (err) {
        console.error("Error fetching cards for the dashboard:", err);
      } finally {
        if (alive) setCardsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* My Bills needs the per-loan / per-card entry rows — fetched once
     both lists are in (a handful of calls; a failure just leaves the
     section empty rather than breaking the dashboard). */
  useEffect(() => {
    if (loansLoading || cardsLoading) return undefined;
    let alive = true;
    (async () => {
      try {
        const entries = await loanService.listBillEntries(loans, cards);
        if (alive) setBillEntries(entries);
      } catch (err) {
        console.error("Error fetching bill entries for the dashboard:", err);
      } finally {
        if (alive) setBillsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loans, cards, loansLoading, cardsLoading]);

  /* Balance = income − expense across every record (purchases are
     card spending, counted on the Cards tab — see kpiStats.js). */
  const balance = useMemo(
    () => computeTransactionStats(transactions).balance,
    [transactions]
  );

  const activeLoans = useMemo(
    () => loans.filter((l) => l.cStatus === "A").slice(0, LOAN_LIMIT),
    [loans]
  );

  const visibleSavings = useMemo(
    () => savings.slice(0, SAVINGS_LIMIT),
    [savings]
  );

  /* UNPAID BILLS: what's still owed THIS month — overdue ahead of
     upcoming, soonest due first. Three rows; the full three-tab report
     lives behind the BILLS shortcut / View all. */
  const unpaidBills = useMemo(() => {
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return buildBills({
      loans,
      loanEntries: billEntries.loanEntries,
      cards,
      transactions,
      cardEntries: billEntries.cardEntries,
    })
      .filter((b) => isThisMonth(b, now) && !b.paid)
      .sort((a, b) => {
        const aPast = a.due.getTime() < today;
        const bPast = b.due.getTime() < today;
        if (aPast !== bPast) return aPast ? -1 : 1; // overdue, then upcoming
        return a.due.getTime() - b.due.getTime();
      })
      .slice(0, BILLS_LIMIT);
  }, [loans, billEntries, cards, transactions]);

  /* The "Savings:" line on the balance card counts FAVOURITED funds
     only — the ones pinned on the Savings page. */
  const favoriteSavingsTotal = useMemo(
    () =>
      savings
        .filter(isFavorite)
        .reduce((sum, s) => sum + (Number(s.dBalance) || 0), 0),
    [savings]
  );

  const recent = useMemo(
    () =>
      [...transactions]
        .filter((t) => t.dttCreated)
        .sort((a, b) => new Date(b.dttCreated) - new Date(a.dttCreated))
        .slice(0, RECENT_LIMIT),
    [transactions]
  );

  /* METRICS swaps the whole dashboard body for the report — the
     header/nav stay; the report's own back control returns here. */
  if (showMetrics) {
    return <Metrics onBack={() => setShowMetrics(false)} />;
  }
  /* Same swap for the BILLS report. */
  if (showBills) {
    return <Bills onBack={() => setShowBills(false)} />;
  }
  /* Same swap for the BUDGET PLANS page. */
  if (showBudgetPlans) {
    return <BudgetPlans onBack={() => setShowBudgetPlans(false)} />;
  }

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      <Stack spacing={3}>
        {/* ---- Total balance, e-wallet style ---- */}
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 4,
            p: { xs: 3, sm: 4 },
            /* var(--bg-primary) is light in the light theme and navy in
               the dark theme, so it stays readable on the accent in
               both. */
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
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <BalanceIcon sx={{ fontSize: 18 }} />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 500,
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
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
                {hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          <Typography
            component="p"
            sx={{
              position: "relative",
              mt: 1,
              fontWeight: 700,
              fontSize: { xs: "2.25rem", sm: "2.75rem" },
              lineHeight: 1.15,
              /* Positive tracking so the ₱ and digits breathe — the old
                 -0.02em jammed them together. */
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {loading ? (
              <Skeleton
                sx={{ bgcolor: "rgba(255,255,255,0.25)", width: 180, height: 48 }}
              />
            ) : hidden ? (
              "₱ ••••••"
            ) : (
              money(balance)
            )}
          </Typography>
          <Typography variant="caption" sx={{ position: "relative", display: "block", opacity: 0.8 }}>
            {loadError
              ? "Couldn't load your transactions."
              : "Income minus expenses across all transactions"}
          </Typography>
          {/* Set-aside total of the FAVOURITED savings funds — hides
              with the eye like the balance above. */}
          <Typography
            variant="caption"
            sx={{
              position: "relative",
              display: "block",
              mt: 0.75,
              fontWeight: 700,
              opacity: 0.9,
            }}
          >
            {savingsLoading ? (
              <Skeleton sx={{ bgcolor: "rgba(255,255,255,0.25)", width: 130, height: 16 }} />
            ) : hidden ? (
              "Savings: ₱ ••••••"
            ) : (
              `Savings: ${money(favoriteSavingsTotal)}`
            )}
          </Typography>
        </Box>

        {/* ---- Quick-action shortcuts — their own card: one full row
             of icon-only buttons on phones, then labels appear from sm
             up — equal cells that expand across the row (3-up on
             tablets, all five on one row from md). ---- */}
        <Box
          sx={{
            ...panelSx,
            p: { xs: 2, sm: 2.5 },
          }}
        >
          <Box
            sx={{
              display: "grid",
              gap: { xs: 1.5, sm: 2 },
              gridTemplateColumns: {
                xs: "repeat(5, minmax(0, 1fr))",
                sm: "repeat(3, minmax(0, 1fr))",
                md: "repeat(5, minmax(0, 1fr))",
              },
            }}
          >
            {SHORTCUTS.map(({ label, icon, to }) => {
              const ShortcutIcon = icon;
              return (
                <Button
                  key={label}
                  variant="outlined"
                  fullWidth
                  aria-label={label}
                  startIcon={<ShortcutIcon />}
                  onClick={() => navigate(to)}
                  sx={shortcutBtnSx}
                >
                  {/* Icon-only below sm — the label rides along for
                      screen readers via aria-label. */}
                  <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                    {label}
                  </Box>
                </Button>
              );
            })}
          </Box>

          {/* Second row: METRICS opens the metrics report, BUDGET PLANS
              the budget-plan page and BILLS the billed/unbilled report
              (the dashboard view hides behind each). Always 3-up. */}
          <Box
            sx={{
              display: "grid",
              gap: { xs: 1.5, sm: 2 },
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              mt: 2,
              pt: 2,
              borderTop: "1px dashed var(--border-medium)",
            }}
          >
            <Button
              variant="outlined"
              fullWidth
              aria-label="Metrics"
              startIcon={<MetricsIcon />}
              onClick={() => setShowMetrics(true)}
              sx={shortcutBtnSx}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                METRICS
              </Box>
            </Button>
            <Button
              variant="outlined"
              fullWidth
              aria-label="Budget Plans"
              startIcon={<BudgetingIcon />}
              onClick={() => setShowBudgetPlans(true)}
              sx={shortcutBtnSx}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                BUDGET PLANS
              </Box>
            </Button>
            <Button
              variant="outlined"
              fullWidth
              aria-label="Bills"
              startIcon={<BillsIcon />}
              onClick={() => setShowBills(true)}
              sx={shortcutBtnSx}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                BILLS
              </Box>
            </Button>
          </Box>
        </Box>

        {/* ---- Unpaid Bills: still owed THIS month ---- */}
        <Box>
          <SectionHeader
            icon={BillsIcon}
            title="Unpaid Bills"
            onViewAll={() => setShowBills(true)}
          />
          <Box sx={panelSx}>
            {billsLoading ? (
              <RowSkeletons count={3} />
            ) : unpaidBills.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}
              >
                No unpaid bills this month.
              </Typography>
            ) : (
              unpaidBills.map((bill) => {
                const kind =
                  bill.kind === "loan"
                    ? { icon: LoanIcon, color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.14)" }
                    : { icon: CardIcon, color: "#1565c0", bg: "rgba(21, 101, 192, 0.14)" };
                return (
                  <RowShell
                    key={bill.key}
                    icon={kind.icon}
                    iconColor={kind.color}
                    iconBg={kind.bg}
                    title={bill.title}
                    caption={`${bill.subtitle} · Due ${fmtDay(bill.due)}`}
                    amount={money(bill.amount)}
                    amountColor="var(--text-primary)"
                    footer={isOverdue(bill) ? "Overdue" : "Unpaid"}
                  />
                );
              })
            )}
          </Box>
        </Box>

        {/* ---- Savings (rows, same shape as Active Loans) ---- */}
        <Box>
          <SectionHeader
            icon={SavingIcon}
            title="Savings"
            onViewAll={() => navigate("/savings")}
          />
          <Box sx={panelSx}>
            {savingsLoading ? (
              <RowSkeletons count={3} />
            ) : visibleSavings.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}
              >
                No savings yet — add one from the Savings page.
              </Typography>
            ) : (
              visibleSavings.map((saving) => {
                const deposits = Number(saving.nDeposits) || 0;
                return (
                  <RowShell
                    key={saving.nSavingId}
                    icon={SavingIcon}
                    iconColor={TYPE_META.S.color}
                    iconBg={TYPE_META.S.bg}
                    title={saving.strTitle || `Saving #${saving.nSavingId}`}
                    caption={saving.strDescription || saving.strCode || ""}
                    amount={money(saving.dBalance)}
                    amountColor="var(--accent)"
                    footer={
                      deposits > 0
                        ? `${deposits} deposit${deposits === 1 ? "" : "s"}`
                        : "No deposits yet"
                    }
                  />
                );
              })
            )}
          </Box>
        </Box>

        {/* ---- Active loans (rows, same shape as Recent) ---- */}
        <Box>
          <SectionHeader
            icon={LoanIcon}
            title="Loans"
            onViewAll={() => navigate("/loans")}
          />
          <Box sx={panelSx}>
            {loansLoading ? (
              <RowSkeletons count={3} />
            ) : activeLoans.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}
              >
                No active loans right now.
              </Typography>
            ) : (
              activeLoans.map((loan) => {
                const paidCount = Number(loan.nEntriesPaid) || 0;
                const totalCount =
                  Number(loan.nEntriesTotal) || Number(loan.nTerms) || 0;
                return (
                  <RowShell
                    key={loan.nLoanId}
                    icon={LoanIcon}
                    iconColor="var(--accent)"
                    iconBg="color-mix(in srgb, var(--accent) 16%, transparent)"
                    title={loan.strTitle || `Loan #${loan.nLoanId}`}
                    caption={loan.strDescription || loan.strCode || ""}
                    amount={money(loan.dRemaining)}
                    amountColor="var(--accent)"
                    footer={totalCount > 0 ? `${paidCount}/${totalCount} paid` : "Active"}
                  />
                );
              })
            )}
          </Box>
        </Box>

        {/* ---- Cards: physical card faces in one horizontal strip
             (scrolls sideways when there are many) ---- */}
        <Box>
          <SectionHeader
            icon={CardIcon}
            title="Cards"
            onViewAll={() => navigate("/cards")}
          />
          {cardsLoading ? (
            <Box
              sx={{
                display: "flex",
                gap: 2,
                overflowX: "auto",
                pb: 1,
                "& > *": { flexShrink: 0 },
              }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={i}
                  variant="rounded"
                  sx={{ width: { xs: 236, sm: 268 }, height: 150, borderRadius: "18px" }}
                />
              ))}
            </Box>
          ) : cards.length === 0 ? (
            <Box sx={panelSx}>
              <Typography
                variant="body2"
                sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}
              >
                No cards yet — add one from the Cards page.
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                gap: 2,
                overflowX: "auto",
                px: 0.25,
                pt: 0.25,
                pb: 1.25,
                scrollSnapType: "x proximity",
                scrollbarWidth: "thin",
                scrollbarColor: "var(--border-medium) transparent",
                "& > *": { flexShrink: 0, scrollSnapAlign: "start" },
                "&::-webkit-scrollbar": { height: 8 },
                "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "var(--border-medium)",
                  borderRadius: 4,
                },
              }}
            >
              {cards.map((card) => (
                <BankCardFace key={card.nCardId} card={card} />
              ))}
            </Box>
          )}
        </Box>

        {/* ---- Recent transaction history ---- */}
        <Box>
          <SectionHeader
            icon={TransactionsIcon}
            title="Recent Transactions"
            onViewAll={() => navigate("/income-expense")}
          />
          <Box sx={panelSx}>
            {loading ? (
              <RowSkeletons count={4} />
            ) : recent.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ p: 4, textAlign: "center", color: "var(--text-muted)" }}
              >
                {loadError
                  ? "Couldn't load your transactions."
                  : "No transactions yet — add your first one from the Transaction shortcut."}
              </Typography>
            ) : (
              recent.map((t) => {
                const meta = TYPE_META[t.cType] || {
                  label: t.cType || "—",
                  color: "var(--text-muted)",
                  bg: "transparent",
                  icon: TransactionsIcon,
                };
                /* I and S are money in; E, P (and B) are money out. */
                const moneyIn = t.cType === "I" || t.cType === "S";
                const caption = t.strDescription;
                return (
                  <RowShell
                    key={t.nTransactionId}
                    icon={meta.icon}
                    iconColor={meta.color}
                    iconBg={meta.bg}
                    title={t.strTitle || "—"}
                    caption={
                      caption ? (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ fontStyle: "italic", display: "block" }}
                        >
                          {caption}
                        </Typography>
                      ) : (
                        meta.label
                      )
                    }
                    amount={
                      <>
                        {moneyIn ? "+" : "−"}
                        {money(t.dAmount)}
                      </>
                    }
                    amountColor={moneyIn ? "#2e7d32" : "#f44336"}
                    footer={formatDate(t.dttCreated)}
                  />
                );
              })
            )}
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
