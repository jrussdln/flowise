import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, IconButton, ListItemButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import {
  ReceiptLong as LedgerIcon,
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
  SwapHorizOutlined as SwapIcon,
  ShoppingBagOutlined as PurchaseIcon,
  PaymentOutlined as PaymentIcon,
  HandshakeOutlined as LoanTypeIcon,
  KeyboardArrowDownOutlined as ChevronDownIcon,
  PublishedWithChangesOutlined as StatusIcon,
  Check as CheckIcon,
  VisibilityOutlined as ViewIcon,
} from "@mui/icons-material";
import Table from "../../../../../components/ui/Table";
import FilterCards from "../../../../../components/ui/FilterCards";
import LedgerAEModal from "./LedgerAEModal";
import { ledgerService } from "../../../../../services/ledgerService";
import { accountService } from "../../../../../services/accountService";
import { categoryService } from "../../../../../services/categoryService";
import { loanService } from "../../../../../services/loanService";
import { useContentChrome } from "../../../../../hooks/usePageChrome";
import {
  RowActions,
  accountBalance,
  buildCounts,
  contentHeader,
  creditBalance,
  useToast,
} from "../../shared";

const CONTENT_HEADER = contentHeader(LedgerIcon, "Ledger");

/* Colors + icons for the movement types — each renders as a tinted
   circle (like the dashboard's transaction rows): up arrow = In,
   down arrow = Out, shopping bag = Credit charge, card = Payment,
   swap arrows = Transfer. */
const TYPE_META = {
  IN: { label: "In", color: "#2e7d32", Icon: TrendUpIcon },
  OUT: { label: "Out", color: "#d32f2f", Icon: TrendDownIcon },
  PRC: { label: "Credit", color: "#7b1fa2", Icon: PurchaseIcon },
  PAY: { label: "Payment", color: "#00897b", Icon: PaymentIcon },
  LN: { label: "Loan", color: "#e65100", Icon: LoanTypeIcon },
  TRF: { label: "Transfer", color: "#1565c0", Icon: SwapIcon },
};

const STATUS_META = {
  PENDING: { label: "Pending", color: "#d97706" },
  POSTED: { label: "Posted", color: "#2e7d32" },
  VOID: { label: "Void", color: "var(--text-muted)" },
};

/* Today as YYYY-MM-DD (ISO dates compare correctly as strings). */
const todayISO = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

const isThisMonth = (value) => {
  if (!value) return false;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "IN", label: "In" },
  { value: "OUT", label: "Out" },
  { value: "PRC", label: "Credit" },
  { value: "PAY", label: "Payment" },
  { value: "LN", label: "Loan" },
  { value: "TRF", label: "Transfer" },
];


const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "POSTED", label: "Posted" },
  { value: "VOID", label: "Void" },
];

/* Header quick-add buttons: one icon per movement type. Colors match
   the AMOUNT_COLOR mapping below (green in, red out, blue transfer). */
const TYPE_ACTIONS = [
  { cType: "IN", label: "Inflow", Icon: TrendUpIcon, color: "#2e7d32" },
  { cType: "OUT", label: "Outflow", Icon: TrendDownIcon, color: "#d32f2f" },
  { cType: "PRC", label: "Credit", Icon: PurchaseIcon, color: "#7b1fa2" },
  { cType: "PAY", label: "Payment", Icon: PaymentIcon, color: "#00897b" },
  { cType: "TRF", label: "Transfer", Icon: SwapIcon, color: "#1565c0" },
];

const peso = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const prettyDate = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

/* How the amount reads per type: money in, money out, credit charge,
   payment (leaves the paying account), moved. */
const AMOUNT_SIGN = { IN: "+", OUT: "−", PRC: "−", PAY: "−", LN: "−", TRF: "→" };
const AMOUNT_COLOR = {
  IN: "#2e7d32",
  OUT: "#d32f2f",
  PRC: "#7b1fa2",
  PAY: "#00897b",
  LN: "#e65100",
  TRF: "var(--text-primary)",
};

export default function Ledger() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  /* Loans (for resolving a Loan entry's linked account). */
  const [loans, setLoans] = useState([]);
  /* Real loading flag for the dropdowns in the add/edit modal — an
     empty list must NOT read as "loading", or the selects skeleton
     forever for users who have no accounts/categories yet. */
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  /* Type filter seeds from the URL (?type=LN etc.) — e.g. the loan
     viewer's "View in Ledger" lands with the Loan card selected.
     Unknown/missing values fall back to All Types. */
  const [searchParams] = useSearchParams();
  const urlType = searchParams.get("type");
  const [typeFilter, setTypeFilter] = useState(
    TYPE_FILTER_OPTIONS.some((o) => o.value === urlType) ? urlType : "all"
  );
  const [statusFilter, setStatusFilter] = useState("all");
  /* Collapsible filter card — the header toggle hides/shows the rows. */
  const [filtersOpen, setFiltersOpen] = useState(true);

  const { showToast, toastNode } = useToast();

  /* Popover-based status changer on the Actions cell (IN/OUT/TRF only —
     Credit charges and Payments are managed via the credit-card
     viewer's Pay/Void tabs instead). */
  const [statusAnchor, setStatusAnchor] = useState(null);
  const [statusRow, setStatusRow] = useState(null);

  /* Opens the Add modal with the movement type already fixed — the
     header's three icon buttons each preset one (no Type field inside). */
  const handleOpenAdd = useCallback((cType = "OUT") => {
    setEditingEntry(null);
    setFormData({
      strTitle: "",
      cType,
      dAmount: "",
      dFee: "",
      dTransactionDate: new Date().toISOString().slice(0, 10),
      nAccountId: "",
      nToAccountId: "",
      nCategoryId: "",
      strMerchant: "",
      strReference: "",
      cStatus: "POSTED",
      strNotes: "",
    });
    setModalOpen(true);
  }, []);

  /* Entries + the two lookup lists the table/form need. */
  const fetchLedger = useCallback(async () => {
    setLoading(true);
    setLookupsLoading(true);
    try {
      const [rows, accountRows, categoryRows, loanRows] = await Promise.all([
        ledgerService.list(),
        accountService.list().catch(() => []),
        categoryService.list({ activeOnly: true }).catch(() => []),
        loanService.list().catch(() => []),
      ]);
      setEntries(rows || []);
      setLoans(loanRows || []);
      /* Accounts carry their live balance, computed from the entries
         themselves: credit cards use limit − unpaid charges, everyone
         else opening balance + signed entries (VOID excluded). */
      setAccounts(
        (accountRows || []).map((a) => ({
          ...a,
          dBalance:
            a.cAccountType === "CREDIT" ? creditBalance(a, rows || []) : accountBalance(a, rows || []),
        }))
      );
      setCategories(categoryRows || []);
    } catch (err) {
      console.error("Error fetching ledger:", err);
      showToast(err.message || "Failed to load ledger", "error");
    } finally {
      setLoading(false);
      setLookupsLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleOpenEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({
      strTitle: entry.strTitle || "",
      cType: entry.cType || "OUT",
      dAmount: entry.dAmount ?? "",
      dFee: entry.dFee ?? "",
      dTransactionDate: entry.dTransactionDate || new Date().toISOString().slice(0, 10),
      nAccountId: entry.nAccountId ?? "",
      nToAccountId: entry.nToAccountId ?? "",
      nCategoryId: entry.nCategoryId ?? "",
      strMerchant: entry.strMerchant || "",
      strReference: entry.strReference || "",
      cStatus: entry.cStatus || "POSTED",
      strNotes: entry.strNotes || "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingEntry(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveEntry = async () => {
    if (!formData.strTitle?.trim()) {
      showToast("Title is required.", "warning");
      return;
    }
    if (!formData.dAmount || Number(formData.dAmount) <= 0) {
      showToast("Amount must be greater than zero.", "warning");
      return;
    }
    if (formData.cType !== "LN" && !formData.nAccountId) {
      showToast("Source account is required.", "warning");
      return;
    }
    if (formData.cType === "TRF" && !formData.nToAccountId) {
      showToast("A transfer needs a destination account.", "warning");
      return;
    }

    /* Insufficient funds: money can't leave an account it doesn't
       have — amount + fee must fit the source balance (for credit
       cards, the available credit). Inflow is exempt. */
    if (formData.cType !== "IN") {
      const source = accounts.find((a) => a.nAccountId === Number(formData.nAccountId));
      const fee = formData.dFee === "" || formData.dFee == null ? 0 : Number(formData.dFee);
      const total = Number(formData.dAmount) + fee;
      const balance = Number(source?.dBalance ?? 0);
      if (source && total > balance) {
        showToast(
          `Amount + fee (₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) exceeds ${source.strName}'s balance (₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}).`,
          "warning"
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        strTitle: formData.strTitle.trim(),
        cType: formData.cType,
        dAmount: Number(formData.dAmount),
        dFee: formData.dFee === "" ? 0 : Number(formData.dFee),
        dTransactionDate: formData.dTransactionDate || new Date().toISOString().slice(0, 10),
        /* Loan entries have no account (loan-level) — send null. */
        nAccountId:
          formData.cType === "LN" || !formData.nAccountId ? null : Number(formData.nAccountId),
        nToAccountId:
          formData.cType === "TRF" && formData.nToAccountId
            ? Number(formData.nToAccountId)
            : null,
        nCategoryId:
          formData.cType !== "TRF" && formData.nCategoryId ? Number(formData.nCategoryId) : null,
        /* Transfers record the From account's Bank/Provider as the
           Merchant (e.g. "BPI") unless the user typed their own. */
        strMerchant:
          formData.cType === "TRF"
            ? formData.strMerchant?.trim() ||
              accounts.find((a) => a.nAccountId === Number(formData.nAccountId))?.strInstitution ||
              null
            : formData.strMerchant?.trim() || null,
        strReference: formData.strReference?.trim() || null,
        cStatus: formData.cStatus,
        strNotes: formData.strNotes?.trim() || null,
      };

      if (editingEntry) {
        await ledgerService.update(editingEntry.nLedgerId, payload);
        showToast("Entry updated successfully!");
      } else {
        await ledgerService.create(payload);
        showToast("Entry added successfully!");
      }

      handleCloseModal();
      await fetchLedger();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save entry", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;

    try {
      await ledgerService.remove(id);
      showToast("Entry deleted successfully!");
      await fetchLedger();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete entry", "error");
    }
  };

  const handleOpenStatus = (row, event) => {
    setStatusAnchor(event.currentTarget);
    setStatusRow(row);
  };
  const handleCloseStatus = () => {
    setStatusAnchor(null);
    setStatusRow(null);
  };
  const handleStatusChange = async (row, nextStatus) => {
    handleCloseStatus();
    if (nextStatus === row.cStatus) return;
    try {
      await ledgerService.update(row.nLedgerId, { cStatus: nextStatus });
      showToast("Status updated successfully!");
      await fetchLedger();
    } catch (err) {
      console.error("Status change error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  /* Credit (PRC) and Payment (PAY) rows are managed in their viewers,
     not here — the actions cell routes there instead:
       • Credit → Accounts page, viewer opened on the card
       • Payment → loan viewer on the Loans page when the payment is
         linked to a loan via Reference; otherwise the Accounts page
         viewer (credit-card payments link back to the charge). */
  const handleOpenViewer = (row) => {
    const ref = row.strReference ? String(row.strReference) : null;
    const linked = ref ? entries.find((e) => String(e.nLedgerId) === ref) : null;
    if (row.cType === "PAY" && linked?.nLoanId != null) {
      navigate(`/loans?open=${linked.nLoanId}`);
    } else if (row.cType === "PAY" && linked?.cType === "PRC" && linked.nAccountId != null) {
      navigate(`/accounts?open=${linked.nAccountId}`);
    } else if (row.nAccountId != null) {
      navigate(`/accounts?open=${row.nAccountId}`);
    }
  };

  /* id -> row maps so entries can show names instead of numbers. */
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.nAccountId, a])),
    [accounts]
  );  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.nCategoryId, c])),
    [categories]
  );

  /* Loan payment entries indexed by the Reference they carry (the
     ledger id of the Loan entry they pay) — used to detect payments
     made AFTER the due date ("Late Payment"). */
  const payByRef = useMemo(
    () =>
      new Map(
        entries
          .filter((e) => e.cType === "PAY" && e.strReference)
          .map((e) => [String(e.strReference), e])
      ),
    [entries]
  );

  /* Loan entries show a bill-state badge instead of an account:
     Paid (paid on/before the due date), Late Payment (paid but the
     due date had passed when the payment landed), Overdue (unpaid,
     due date passed), Billed (unpaid, due this month), Unbilled
     (unpaid, due in a later month). */
  const loanBadgeMeta = (row) => {
    if (row.bIsPaid) {
      const pay = payByRef.get(String(row.nLedgerId));
      const late = pay && String(pay.dTransactionDate).slice(0, 10) > String(row.dTransactionDate).slice(0, 10);
      return late
        ? { label: "Late Payment", color: "#e65100" }
        : { label: "Paid", color: "#2e7d32" };
    }
    if (String(row.dTransactionDate).slice(0, 10) < todayISO())
      return { label: "Overdue", color: "#d32f2f" };
    if (isThisMonth(row.dTransactionDate)) return { label: "Billed", color: "#d97706" };
    return { label: "Unbilled", color: "var(--text-muted)" };
  };

  const rowsWithNames = useMemo(
    () =>
      entries.map((e) => {
        /* A Loan entry's "account" is the account its loan is linked
           to (loan.nAccountId) — the loan account itself. */
        const loanRow = loans.find((l) => l.nLoanId === e.nLoanId);
        const loanAccount = loanRow?.nAccountId != null ? accountMap[loanRow.nAccountId] : null;
        const baseAccount = e.cType === "LN" ? loanAccount : accountMap[e.nAccountId];
        return {
          ...e,
          /* Account NAME on top, details (Bank/Provider + masked last 4)
             below — e.g. name "JRDD", detail "Gcash ••••0603". */
          accountName: baseAccount?.strName || "—",
          accountMeta: baseAccount
            ? [
                baseAccount.strInstitution,
                baseAccount.strLast4 ? `••••${baseAccount.strLast4}` : "",
              ]
                .filter(Boolean)
                .join(" ") || null
            : null,
          toAccountName: accountMap[e.nToAccountId]?.strName || null,
          categoryName: categoryMap[e.nCategoryId]?.strName || null,
        };
      }),
    [entries, accountMap, categoryMap, loans]
  );

  const columns = [
    {
      id: "strTitle",
      label: "Title",
      minWidth: 200,
      format: (_, row) => {
        /* Tinted direction circle (dashboard-row style) on the left:
           up = In, down = Out, swap = Transfer. A small status dot is
           overlaid on the lower part of the circle (tooltip = status).
           The second line reads "Merchant - Category" (falling back to
           the reference). */
        const meta = TYPE_META[row.cType] || { color: "var(--text-muted)" };
        const status = STATUS_META[row.cStatus] || { label: row.cStatus, color: "var(--text-muted)" };
        const caption =
          [row.strMerchant, row.categoryName].filter(Boolean).join(" - ") ||
          row.strReference ||
          "—";
        return (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
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
                backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                color: meta.color,
                "& svg": { fontSize: 16 },
              }}
            >
              {meta.Icon ? <meta.Icon /> : null}
              {/* Status dot pinned over the icon's upper-right edge */}
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
            <Box sx={{ minWidth: 0, flex: 1 }}>
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
              {/* Loan entries show their bill state as plain uppercase
                  text under the caption (BILLED / UNBILLED / OVERDUE /
                  PAID / LATE PAYMENT) instead of a badge next to the
                  title. */}
              {row.cType === "LN" && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: loanBadgeMeta(row).color,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {loanBadgeMeta(row).label}
                </Typography>
              )}
            </Box>
          </Stack>
        );
      },
    },
    {
      id: "dAmount",
      label: "Amount",
      minWidth: 120,
      align: "right",
      format: (_, row) => (
        <Box>
          <Typography
            variant="body2"
            sx={{ color: AMOUNT_COLOR[row.cType] || "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}
          >
            {AMOUNT_SIGN[row.cType] || ""} {peso(row.dAmount)}
          </Typography>
          {Number(row.dFee) > 0 && (
            <Typography
              variant="caption"
              sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.25, whiteSpace: "nowrap" }}
            >
              + {peso(row.dFee)} fee
            </Typography>
          )}
          {/* Date sits under the amount — lighter, italic. */}
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "var(--text-muted)",
              fontStyle: "italic",
              fontWeight: 400,
              lineHeight: 1.25,
              whiteSpace: "nowrap",
            }}
          >
            {prettyDate(row.dTransactionDate)}
          </Typography>
        </Box>
      ),
    },
    {
      id: "accountName",
      label: "Account",
      minWidth: 170,
      align: "right",
      format: (_, row) => (
          <Box sx={{ minWidth: 0, textAlign: "right" }}>
            <Typography
              variant="body2"
              sx={{
                color: "var(--text-primary)",
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.cType === "TRF" && row.toAccountName
                ? `${row.accountName} → ${row.toAccountName}`
                : row.accountName}
            </Typography>
            {row.accountMeta && (
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
                {row.accountMeta}
              </Typography>
            )}
          </Box>
        ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => {
        const status =
          STATUS_META[row.cStatus] || { label: row.cStatus, color: "var(--text-muted)" };
        /* Status button. Credit charges (PRC) and Payments (PAY) are
           managed in their own viewers, so the disabled status button
           is REPLACED by a View button that routes there (Accounts
           viewer for credit cards; loan viewer for loan payments).
           Loan (LN) rows get the same View button routed to the
           loan's viewer on the Loans page. IN/OUT/TRF keep the status
           popover. Rendered via RowActions' extra slot. */
        const viewerRouted = row.cType === "PRC" || row.cType === "PAY";
        const isLoan = row.cType === "LN";
        const statusButton = viewerRouted ? (
          <Tooltip title="View in its viewer" arrow>
            <IconButton
              size="small"
              aria-label={`View ${row.strTitle || "entry"} in its viewer`}
              onClick={() => handleOpenViewer(row)}
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
        ) : isLoan ? (
          <Tooltip title="View in its loan viewer" arrow>
            <IconButton
              size="small"
              aria-label={`View ${row.strTitle || "entry"} in its loan viewer`}
              onClick={() => row.nLoanId != null && navigate(`/loans?open=${row.nLoanId}`)}
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
        ) : (
          <Tooltip
            title={`Change status (now: ${status.label})`}
            arrow
          >
            <span>
              <IconButton
                size="small"
                aria-label={`Change status of ${row.strTitle || "entry"}`}
                onClick={(event) => handleOpenStatus(row, event)}
                sx={{
                  borderRadius: 1.5,
                  color: status.color,
                  backgroundColor: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                }}
              >
                <StatusIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        );
        return (
          <RowActions
            label={row.strTitle || "entry"}
            extra={statusButton}
            onEdit={() => handleOpenEdit(row)}
            /* No delete callback → RowActions hides the Delete button. */
            onDelete={isLoan ? undefined : () => handleDeleteEntry(row.nLedgerId)}
          />
        );
      },
    },
  ];

  const visibleRows = useMemo(
    () =>
      rowsWithNames.filter(
        (e) =>
          /* Loan and Payment entries only appear when their filter card
             is selected — loans are managed from the Loans page and
             payments from it too, so the default "All Types" view
             hides both. */
          (typeFilter === "all"
            ? e.cType !== "LN" && e.cType !== "PAY"
            : e.cType === typeFilter) &&
          (statusFilter === "all" || e.cStatus === statusFilter)
      ),
    [rowsWithNames, typeFilter, statusFilter]
  );

  const typeCounts = useMemo(() => {
    const counts = buildCounts(rowsWithNames, "cType", TYPE_FILTER_OPTIONS);
    /* "All Types" hides Loan and Payment entries — its badge counts
       only what the view actually shows. */
    counts.all = rowsWithNames.filter(
      (e) => e.cType !== "LN" && e.cType !== "PAY"
    ).length;
    return counts;
  }, [rowsWithNames]);
  const statusCounts = useMemo(
    () => buildCounts(rowsWithNames, "cStatus", STATUS_FILTER_OPTIONS),
    [rowsWithNames]
  );

  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {/* One quick-add button per movement type (icon + label); the
            modal opens with that type preset (no Type field inside). */}
        {TYPE_ACTIONS.map((action) => (
          <Tooltip key={action.cType} title={`Add ${action.label}`} arrow>
            <Button
              onClick={() => handleOpenAdd(action.cType)}
              aria-label={`Add ${action.label}`}
              startIcon={<action.Icon />}
              sx={{
                height: { xs: 30, sm: 34 },
                minHeight: { xs: 30, sm: 34 },
                px: { xs: 0.75, sm: 1.5 },
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: "var(--border-medium)",
                backgroundColor: "var(--bg-secondary)",
                color: action.color,
                fontWeight: 600,
                fontSize: { xs: "0.7rem", sm: "0.78rem" },
                textTransform: "none",
                whiteSpace: "nowrap",
                "& .MuiButton-startIcon": { mr: { xs: 0, sm: 0.5 } },
                "& svg": { fontSize: { xs: 15, sm: 17 } },
                "&:hover": {
                  borderColor: action.color,
                  backgroundColor: `color-mix(in srgb, ${action.color} 12%, transparent)`,
                },
              }}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {action.label}
              </Box>
            </Button>
          </Tooltip>
        ))}
      </Stack>
    ),
    [handleOpenAdd]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      {/* Filter cards inside their own card, matching the table's
          chrome — one row per dimension, wrapping when they don't fit.
          The header's chevron toggle collapses/expands the rows. */}
      <Box
        sx={{
          width: "100%",
          mb: 1.5,
          border: "1px solid var(--border-medium)",
          borderRadius: 3,
          backgroundColor: "var(--card-bg)",
          px: { xs: 1.25, sm: 1.5 },
          py: { xs: 0.75, sm: 1 },
        }}
      >
        {/* Header — the WHOLE row toggles collapse/expand. Rendered as a
            button for accessibility; the icon inside is decorative. */}
        <Box
          component="button"
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-expanded={filtersOpen}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            background: "transparent",
            border: "none",
            p: 0,
            m: 0,
            cursor: "pointer",
            textAlign: "left",
            borderRadius: 1,
            "&:focus-visible": {
              outline: "2px solid var(--accent)",
              outlineOffset: 2,
            },
            /* Row hover feedback: label brightens, chip gets a tinted
               background (the icon is pointer-events none, so hover is
               driven entirely by the row). */
            "&:hover": {
              "& .filter-label": { color: "var(--text-primary)" },
              "& .filter-toggle": {
                color: "var(--text-primary)",
                backgroundColor: "var(--overlay-dark)",
              },
            },
          }}
        >
          <Typography
            className="filter-label"
            sx={{
              fontSize: "0.68rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif",
              transition: "color 0.15s ease-out",
            }}
          >
            Filter by:
            {!filtersOpen && (typeFilter !== "all" || statusFilter !== "all") && (
              <Box
                component="span"
                sx={{ ml: 1, textTransform: "none", fontWeight: 500, color: "var(--accent)" }}
              >
                {typeFilter !== "all" &&
                  TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label}
                {typeFilter !== "all" && statusFilter !== "all" && " · "}
                {statusFilter !== "all" &&
                  STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label}
              </Box>
            )}
          </Typography>
          <IconButton
            className="filter-toggle"
            size="small"
            tabIndex={-1}
            sx={{
              pointerEvents: "none",
              color: "var(--text-muted)",
              transition: "color 0.15s ease-out, background-color 0.15s ease-out",
              "& svg": {
                fontSize: 18,
                transform: filtersOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease-out",
              },
            }}
          >
            <ChevronDownIcon />
          </IconButton>
        </Box>

        {filtersOpen && (
          /* ONE wrapping row for both groups — Type and Status sit on
             the same line when they all fit; otherwise each group (and
             then individual cards) wraps to the next line. */
          <Stack
            direction="row"
            sx={{
              mt: 0.75,
              flexWrap: "wrap",
              alignItems: "center",
              rowGap: 0.75,
              columnGap: { xs: 1, sm: 2 },
            }}
          >
            <FilterCards
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              counts={typeCounts}
              label="Filter by type"
              title="Type"
            />
            <FilterCards
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTER_OPTIONS}
              counts={statusCounts}
              label="Filter by status"
              title="Status"
            />
          </Stack>
        )}
      </Box>

      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nLedgerId"
        searchPlaceholder="Search by title, merchant, account..."
        searchFields={["strTitle", "strMerchant", "strReference", "accountName", "accountMeta", "categoryName"]}
      />

      {/* Tooltip-style popover on the Actions status button (IN/OUT/TRF). */}
      <Popover
        open={Boolean(statusAnchor) && Boolean(statusRow)}
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
        {statusRow &&
          STATUS_FILTER_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => {
            const meta = STATUS_META[opt.value] || { color: "var(--text-muted)" };
            const isCurrent = statusRow.cStatus === opt.value;
            return (
              <ListItemButton
                key={opt.value}
                dense
                selected={isCurrent}
                onClick={() => handleStatusChange(statusRow, opt.value)}
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
                  {opt.label}
                </Typography>
                {isCurrent && <CheckIcon sx={{ fontSize: 16, color: "var(--text-muted)" }} />}
              </ListItemButton>
            );
          })}
      </Popover>

      <LedgerAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveEntry}
        editingEntry={editingEntry}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
        accounts={accounts}
        categories={categories}
        lookupsLoading={lookupsLoading}
      />

      {toastNode}
    </Box>
  );
}
