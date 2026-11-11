import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Collapse,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  AccountBalance as LoanIcon,
  CreditCard as CardIcon,
  ExpandMore as ChevronIcon,
  Receipt as BillsIcon,
} from "@mui/icons-material";
import { transactionService } from "../../../../services/transactionService";
import { loanService } from "../../../../services/loanService";
import { cardService } from "../../../../services/cardService";
import { fmtDay } from "../../../../lib/loanSchedule";
import { buildBills } from "../../../../lib/bills";

/* ₱ amounts — change the locale/currency here if you need another one. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

const KIND_META = {
  loan: { icon: LoanIcon, color: "#7b1fa2", bg: "rgba(123, 31, 162, 0.14)" },
  card: { icon: CardIcon, color: "#1565c0", bg: "rgba(21, 101, 192, 0.14)" },
};

/* Section heading — same reduced weight/size as the rest of the app. */
function SectionHeader({ title, total, count }) {
  return (
    <Stack
      direction="row"
      sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1 }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 500,
          fontSize: "0.82rem",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
        {count} {count === 1 ? "bill" : "bills"} · {money(total)}
      </Typography>
    </Stack>
  );
}

/* One bill: kind icon, title + meta line, amount. */
function BillRow({ bill, last }) {
  const KindIcon = KIND_META[bill.kind].icon;
  const kind = KIND_META[bill.kind];
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "center",
        py: 1.25,
        px: { xs: 2, sm: 2.5 },
        borderBottom: last ? "none" : "1px solid var(--border-light)",
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: kind.bg,
          color: kind.color,
          flexShrink: 0,
        }}
      >
        <KindIcon sx={{ fontSize: 18 }} />
      </Box>
      <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{ color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {bill.title}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "var(--text-muted)", display: "block" }}
        >
          {bill.subtitle} · Due {fmtDay(bill.due)}
        </Typography>
      </Stack>
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
      >
        {money(bill.amount)}
      </Typography>
    </Stack>
  );
}

/* "Hide all / Show all" in the caption row's right corner — folds or
   unfolds every month group in the current tab. Label follows state:
   everything open offers Hide, anything hidden offers Show. */
function CollapseAllButton({ allOpen, onClick }) {
  return (
    <Button
      size="small"
      onClick={onClick}
      sx={{
        minWidth: 0,
        px: 1,
        py: 0.25,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        "&:hover": { backgroundColor: "transparent", color: "var(--accent)" },
      }}
    >
      {allOpen ? "Hide all" : "Show all"}
    </Button>
  );
}

/* A month group: a clickable header (month + summary, chevron on the
   left) that folds its rows away — used by the Paid Bills and Unbilled
   tabs. Open/closed state lives in the parent (`collapsed` set). */
function MonthGroup({ label, summary, open, onToggle, children }) {
  return (
    <Box>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "baseline",
          px: { xs: 2, sm: 2.5 },
          pt: 1.5,
          pb: 0.75,
          borderTop: "1px solid var(--border-light)",
          backgroundColor: "var(--bg-secondary)",
          textAlign: "left",
          cursor: "pointer",
          "&:hover": { backgroundColor: "var(--border-light)" },
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <ChevronIcon
            sx={{
              fontSize: 16,
              color: "var(--text-muted)",
              transform: open ? "none" : "rotate(-90deg)",
              transition: "transform 0.2s ease",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: "var(--text-primary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {label}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ color: "var(--text-muted)", flexShrink: 0 }}>
          {summary}
        </Typography>
      </ButtonBase>
      <Collapse in={open}>{children}</Collapse>
    </Box>
  );
}

/**
 * Bills — what's owed on LOANS and CREDIT-CARD purchases, by month.
 *
 * Three tabs (BILLED opens by default):
 *   PAID BILLS  settled history from PAST months, grouped by month —
 *               newest month on top, each header showing that month's
 *               paid total; every month group folds open/closed.
 *   BILLED    bills falling due THIS month, in two sections — Unpaid
 *             and Paid (a loan term settles via the Loans tab, a card
 *             purchase via the Cards tab; the state follows the same
 *             tblentries rows, so it always matches those screens).
 *   UNBILLED  every other month's bills still in play, GROUPED BY
 *             MONTH — the most overdue month first, then upcoming
 *             months soonest first; each header carries that month's
 *             still-due total, and inside a month unpaid rows sit
 *             above paid ones.
 *
 * A loan term is billed when its derived due date (first payment date +
 * index × period, see lib/loanSchedule) lands this month; a purchase is
 * billed when its billing due date (card's due day, month after the
 * charge, see lib/cards) lands this month. Bills with no usable due
 * date — an undated purchase or a card with no billing day — can't be
 * placed in a month and are left out.
 *
 * Opened by the BILLS button on the Dashboard; `onBack` returns there.
 */
export default function Bills({ onBack }) {
  const [loans, setLoans] = useState([]);
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  /* Loan id -> its schedule entries; card id -> its repayment entries.
     Fetched per record after the lists load (a handful of calls). */
  const [loanEntries, setLoanEntries] = useState(new Map());
  const [cardEntries, setCardEntries] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState(1); // 0 Paid Bills, 1 Billed, 2 Unbilled
  /* Folded month groups (by "tab:key") — both grouped tabs start open. */
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleGroup = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /* Fold/unfold every month group of one tab in a single click. */
  const toggleAllGroups = (prefix, groups) =>
    setCollapsed((prev) => {
      const ids = groups.map((g) => `${prefix}${g.key}`);
      const allOpen = ids.every((id) => !prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (allOpen) next.add(id); // everything open -> hide all
        else next.delete(id); // anything hidden -> show all
      }
      return next;
    });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [loansRes, cardsRes, txRes] = await Promise.allSettled([
        loanService.list(),
        cardService.list(),
        transactionService.list(),
      ]);
      if (!alive) return;

      const loanRows = loansRes.status === "fulfilled" ? loansRes.value || [] : [];
      const cardRows = cardsRes.status === "fulfilled" ? cardsRes.value || [] : [];
      const txRows = txRes.status === "fulfilled" ? txRes.value || [] : [];
      if (
        loansRes.status === "rejected" ||
        cardsRes.status === "rejected" ||
        txRes.status === "rejected"
      ) {
        console.error("Error fetching bills base data:", {
          loans: loansRes.status === "rejected" ? loansRes.reason : undefined,
          cards: cardsRes.status === "rejected" ? cardsRes.reason : undefined,
          transactions: txRes.status === "rejected" ? txRes.reason : undefined,
        });
        setLoadError(true);
      }
      setLoans(loanRows);
      setCards(cardRows);
      setTransactions(txRows);

      /* Second wave: the entries that say what's paid — one call per
         Active/Completed loan and per credit card, as two Maps. */
      const { loanEntries, cardEntries } = await loanService.listBillEntries(
        loanRows,
        cardRows
      );
      if (!alive) return;
      setLoanEntries(loanEntries);
      setCardEntries(cardEntries);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* Every bill the data can place in a month: loan terms (settled or
     not) plus credit-card purchases, past and future — built by the
     shared lib the dashboard's My Bills section also uses. */
  const bills = useMemo(
    () =>
      buildBills({
        loans,
        loanEntries,
        cards,
        transactions,
        cardEntries,
      }),
    [loans, loanEntries, cards, transactions, cardEntries]
  );

  const { billed, unbilled, unbilledGroups, paidGroups, overdueCount } =
    useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    /* Due dates are wall-clock days carried in UTC fields. */
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const inThisMonth = (b) =>
      `${b.due.getUTCFullYear()}-${b.due.getUTCMonth()}` === monthKey;

    const billedRows = bills.filter(inThisMonth);
    const isOverdue = (b) => !b.paid && b.due.getTime() < today;

    const byUrgency = (a, b) => {
      const aPast = a.due.getTime() < today;
      const bPast = b.due.getTime() < today;
      if (aPast !== bPast) return aPast ? -1 : 1; // overdue first, upcoming after
      return a.due.getTime() - b.due.getTime(); // then oldest due first
    };

    const unpaid = billedRows.filter((b) => !b.paid).sort(byUrgency);
    const paid = billedRows.filter((b) => b.paid).sort(byUrgency);

    /* Past-month PAID bills live in their own PAID BILLS tab — they
       leave the unbilled flow entirely. */
    const nowIndex = now.getFullYear() * 12 + now.getMonth();
    const monthIndex = (b) => b.due.getUTCFullYear() * 12 + b.due.getUTCMonth();
    const paidHistory = bills.filter(
      (b) => b.paid && monthIndex(b) < nowIndex
    );
    const paidKeys = new Set(paidHistory.map((b) => b.key));

    /* Group rows by their due month ("YYYY-MM" sorts lexicographically). */
    const groupByMonth = (rows, sortRows) => {
      const byMonth = new Map();
      for (const b of rows) {
        const key = `${b.due.getUTCFullYear()}-${String(
          b.due.getUTCMonth() + 1
        ).padStart(2, "0")}`;
        if (!byMonth.has(key)) byMonth.set(key, []);
        byMonth.get(key).push(b);
      }
      return [...byMonth.entries()].map(([key, groupRows]) => {
        if (sortRows) groupRows.sort(sortRows);
        const [year, month] = key.split("-").map(Number);
        return {
          key,
          label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
            "en-PH",
            { month: "long", year: "numeric", timeZone: "UTC" }
          ),
          rows: groupRows,
          dueTotal: groupRows
            .filter((r) => !r.paid)
            .reduce((sum, r) => sum + r.amount, 0),
          paidTotal: groupRows.reduce((sum, r) => sum + r.amount, 0),
          past: groupRows[0].due.getTime() < today,
        };
      });
    };

    /* UNBILLED: the other months minus that history, GROUPED by their
       due month — the most overdue month on top, then upcoming months
       soonest first. Inside a month: unpaid above paid, then by due
       date. */
    const others = bills.filter((b) => !inThisMonth(b) && !paidKeys.has(b.key));
    const unbilledGroups = groupByMonth(others, (a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1; // unpaid above paid
      return a.due.getTime() - b.due.getTime();
    }).sort((a, b) => {
      if (a.past !== b.past) return a.past ? -1 : 1; // overdue months first
      return a.key < b.key ? -1 : 1; // then oldest -> newest
    });

    /* PAID BILLS: settled history, newest month on top. */
    const paidGroups = groupByMonth(paidHistory, (a, b) =>
      a.due.getTime() - b.due.getTime()
    ).sort((a, b) => (a.key < b.key ? 1 : -1));

    return {
      billed: { unpaid, paid },
      unbilled: others,
      unbilledGroups,
      paidGroups,
      overdueCount: bills.filter(isOverdue).length,
    };
  }, [bills]);

  const unpaidTotal = billed.unpaid.reduce((sum, b) => sum + b.amount, 0);
  const paidTotal = billed.paid.reduce((sum, b) => sum + b.amount, 0);
  const unbilledDue = unbilled
    .filter((b) => !b.paid)
    .reduce((sum, b) => sum + b.amount, 0);

  const monthLabel = new Date().toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });

  if (loading) {
    return (
      <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
        <Skeleton sx={{ width: 120, height: 24, mb: 3 }} />
        <Skeleton variant="rounded" sx={{ width: "100%", height: 56, mb: 2 }} />
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            sx={{ width: "100%", height: 58, mb: 1 }}
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
          mb: 2,
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <BillsIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
          {/* Breadcrumb — DASHBOARD takes you back, BILLS is where you are. */}
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
              Bills
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      {loadError ? (
        <Typography variant="body2" sx={{ color: "#f44336", mb: 2 }}>
          Some data couldn't be loaded — the bills below may be incomplete.
        </Typography>
      ) : null}

      {/* Billed / Unbilled */}
      <Box
        sx={{
          border: "1px solid var(--border-medium)",
          borderRadius: 3,
          backgroundColor: "var(--card-bg)",
          overflow: "hidden",
          mb: 2,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{
            minHeight: 44,
            borderBottom: "1px solid var(--border-light)",
            "& .MuiTab-root": {
              minHeight: 44,
              fontWeight: 700,
              fontSize: "0.78rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            },
            "& .Mui-selected": { color: "var(--accent)" },
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
          }}
        >
          <Tab label={`Paid Bills (${paidGroups.reduce((n, g) => n + g.rows.length, 0)})`} />
          <Tab
            label={
              overdueCount > 0
                ? `Billed (${overdueCount} overdue)`
                : `Billed (${billed.unpaid.length + billed.paid.length})`
            }
          />
          <Tab label={`Unbilled (${unbilled.length})`} />
        </Tabs>

        {/* ---- PAID BILLS: settled history, grouped by month ---- */}
        {tab === 0 && (
          <Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                px: { xs: 2, sm: 2.5 },
                pt: 1.5,
                pb: 1.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Settled before {monthLabel}
              </Typography>
              {paidGroups.length > 0 && (
                <CollapseAllButton
                  allOpen={paidGroups.every(
                    (g) => !collapsed.has(`paid:${g.key}`)
                  )}
                  onClick={() => toggleAllGroups("paid:", paidGroups)}
                />
              )}
            </Stack>
            {paidGroups.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: "var(--text-muted)", px: { xs: 2, sm: 2.5 }, py: 2 }}
              >
                No paid bills from past months.
              </Typography>
            ) : (
              paidGroups.map((group) => (
                <MonthGroup
                  key={group.key}
                  label={group.label}
                  summary={`${group.rows.length} ${
                    group.rows.length === 1 ? "bill" : "bills"
                  } · ${money(group.paidTotal)} paid`}
                  open={!collapsed.has(`paid:${group.key}`)}
                  onToggle={() => toggleGroup(`paid:${group.key}`)}
                >
                  {group.rows.map((bill, i) => (
                    <BillRow
                      key={bill.key}
                      bill={bill}
                      last={i === group.rows.length - 1}
                    />
                  ))}
                </MonthGroup>
              ))
            )}
          </Box>
        )}

        {/* ---- BILLED: this month, Unpaid then Paid ---- */}
        {tab === 1 && (
          <Box>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                px: { xs: 2, sm: 2.5 },
                pt: 1.5,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Due this month · {monthLabel}
            </Typography>

            <Box sx={{ pt: 1.5 }}>
              <Box sx={{ px: { xs: 2, sm: 2.5 } }}>
                <SectionHeader
                  title="Unpaid"
                  total={unpaidTotal}
                  count={billed.unpaid.length}
                />
              </Box>
              {billed.unpaid.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "var(--text-muted)", px: { xs: 2, sm: 2.5 }, py: 2 }}
                >
                  Nothing unpaid this month.
                </Typography>
              ) : (
                billed.unpaid.map((bill, i) => (
                  <BillRow
                    key={bill.key}
                    bill={bill}
                    last={i === billed.unpaid.length - 1}
                  />
                ))
              )}
            </Box>

            <Box
              sx={{
                mt: 2,
                pt: 2,
                borderTop: "1px solid var(--border-light)",
              }}
            >
              <Box sx={{ px: { xs: 2, sm: 2.5 } }}>
                <SectionHeader
                  title="Paid"
                  total={paidTotal}
                  count={billed.paid.length}
                />
              </Box>
              {billed.paid.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "var(--text-muted)", px: { xs: 2, sm: 2.5 }, py: 2 }}
                >
                  Nothing paid yet this month.
                </Typography>
              ) : (
                billed.paid.map((bill, i) => (
                  <BillRow
                    key={bill.key}
                    bill={bill}
                    last={i === billed.paid.length - 1}
                  />
                ))
              )}
            </Box>
            <Box sx={{ height: 1.5 }} />
          </Box>
        )}

        {/* ---- UNBILLED: other months, grouped by month ---- */}
        {tab === 2 && (
          <Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                px: { xs: 2, sm: 2.5 },
                pt: 1.5,
                pb: 1.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Other months · {money(unbilledDue)} still due
              </Typography>
              {unbilledGroups.length > 0 && (
                <CollapseAllButton
                  allOpen={unbilledGroups.every(
                    (g) => !collapsed.has(`unbilled:${g.key}`)
                  )}
                  onClick={() => toggleAllGroups("unbilled:", unbilledGroups)}
                />
              )}
            </Stack>
            {unbilledGroups.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: "var(--text-muted)", px: { xs: 2, sm: 2.5 }, py: 2 }}
              >
                No bills outside this month.
              </Typography>
            ) : (
              unbilledGroups.map((group) => (
                <MonthGroup
                  key={group.key}
                  label={group.label}
                  summary={`${group.rows.length} ${
                    group.rows.length === 1 ? "bill" : "bills"
                  }${
                    group.dueTotal > 0
                      ? ` · ${money(group.dueTotal)} due`
                      : " · settled"
                  }`}
                  open={!collapsed.has(`unbilled:${group.key}`)}
                  onToggle={() => toggleGroup(`unbilled:${group.key}`)}
                >
                  {group.rows.map((bill, i) => (
                    <BillRow
                      key={bill.key}
                      bill={bill}
                      last={i === group.rows.length - 1}
                    />
                  ))}
                </MonthGroup>
              ))
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
