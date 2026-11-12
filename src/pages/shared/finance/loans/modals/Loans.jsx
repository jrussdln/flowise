import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, IconButton, ListItemButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import {
  RequestQuote as LoansIcon,
  Add as AddIcon,
  HandshakeOutlined as LoanIcon,
  KeyboardArrowDownOutlined as ChevronDownIcon,
  PublishedWithChangesOutlined as StatusIcon,
  VisibilityOutlined as ViewIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import Table from "../../../../../components/ui/Table";
import FilterCards from "../../../../../components/ui/FilterCards";
import LoansAEModal from "./LoansAEModal";
import ViewLoanLedgerEntries from "./ViewLoanLedgerEntries";
import { loanService } from "../../../../../services/loanService";
import { ledgerService } from "../../../../../services/ledgerService";
import { useContentChrome } from "../../../../../hooks/usePageChrome";
import {
  ADD_BUTTON_SX,
  RowActions,
  buildCounts,
  contentHeader,
  ensureCategory,
  loanSchedule,
  useToast,
} from "../../shared";

const CONTENT_HEADER = contentHeader(LoansIcon, "Loans");

const STATUS_META = {
  ACTIVE: { label: "Active", color: "#2e7d32" },
  PAID: { label: "Completed", color: "#1565c0" },
  DEFAULTED: { label: "Defaulted", color: "#d32f2f" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAID", label: "Completed" },
  { value: "DEFAULTED", label: "Defaulted" },
];

const peso = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const prettyDate = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }) : "—";

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(true);

  /* Inline status changer: the Actions cell has a status button whose
     popover (tooltip-style) lists Active/Completed/Defaulted. */
  const [statusAnchor, setStatusAnchor] = useState(null);
  const [statusRow, setStatusRow] = useState(null);
  /* The loan whose Ledger entries are being viewed. */
  const [viewLoan, setViewLoan] = useState(null);
  /* Loan ids that have at least one PAID ledger entry — such loans
     can't be deleted (deleting cascades the entries, which would
     erase paid payment history). */
  const [paidLoanIds, setPaidLoanIds] = useState(() => new Set());
  /* Loan id -> total amount paid so far (sum of its paid LN
     entries), shown as "Paid: ₱x" under the Principal. */
  const [paidTotals, setPaidTotals] = useState(() => new Map());
  /* Loan id -> how many of its schedule entries are paid (for the
     "12/12" term progress in the Status column). */
  const [paidCounts, setPaidCounts] = useState(() => new Map());
  const { showToast, toastNode } = useToast();

  const handleOpenAdd = useCallback(() => {
    setEditingLoan(null);
    setFormData({
      strName: "",
      strLender: "",
      dPrincipal: "",
      dInterestRate: "",
      nTermMonths: "",
      dMonthlyPayment: "",
      dStartDate: new Date().toISOString().slice(0, 10),
      nPaymentDay: "",
      /* New loans start defaulted — activating them posts the
         payment schedule to the Ledger. */
      cStatus: "DEFAULTED",
      strNotes: "",
    });
    setModalOpen(true);
  }, []);

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const [data, ledgerRows] = await Promise.all([
        loanService.list(),
        ledgerService.list().catch(() => []),
      ]);
      setLoans(data || []);
      /* Track which loans have at least one paid entry — their Delete
         button is hidden so paid history can't be erased — and sum
         the paid amounts per loan for the "Paid:" caption. */
      const paidLn = (ledgerRows || []).filter(
        (e) => e.cType === "LN" && e.bIsPaid === true && e.nLoanId != null
      );
      setPaidLoanIds(new Set(paidLn.map((e) => e.nLoanId)));
      const totals = new Map();
      const counts = new Map();
      for (const e of paidLn) {
        totals.set(
          e.nLoanId,
          (totals.get(e.nLoanId) || 0) + Number(e.dAmount || 0) + Number(e.dFee || 0)
        );
        counts.set(e.nLoanId, (counts.get(e.nLoanId) || 0) + 1);
      }
      setPaidTotals(totals);
      setPaidCounts(counts);
    } catch (err) {
      console.error("Error fetching loans:", err);
      showToast(err.message || "Failed to load loans", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const handleOpenEdit = (loan) => {
    setEditingLoan(loan);
    setFormData({
      strName: loan.strName || "",
      strLender: loan.strLender || "",
      dPrincipal: loan.dPrincipal ?? "",
      dInterestRate: loan.dInterestRate ?? "",
      nTermMonths: loan.nTermMonths ?? "",
      dMonthlyPayment: loan.dMonthlyPayment ?? "",
      dStartDate: loan.dStartDate || "",
      nPaymentDay: loan.nPaymentDay ?? "",
      cStatus: loan.cStatus || "ACTIVE",
      strNotes: loan.strNotes || "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingLoan(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveLoan = async () => {
    if (!formData.strName?.trim()) {
      showToast("Loan name is required.", "warning");
      return;
    }
    if (!formData.dPrincipal || Number(formData.dPrincipal) <= 0) {
      showToast("Principal must be greater than zero.", "warning");
      return;
    }
    if (!formData.dStartDate) {
      showToast("Start date is required.", "warning");
      return;
    }

    /* Monthly Payment and Interest Rate are alternatives: a loan is
       either a fixed installment or a rate per term — never both. */
    const hasMonthlyPayment = formData.dMonthlyPayment !== "" && formData.dMonthlyPayment != null;
    const hasInterestRate = formData.dInterestRate !== "" && formData.dInterestRate != null;
    if (hasMonthlyPayment && hasInterestRate) {
      showToast("Provide either a Monthly Payment or an Interest Rate — not both.", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        strName: formData.strName.trim(),
        strLender: formData.strLender?.trim() || null,
        dPrincipal: Number(formData.dPrincipal),
        dInterestRate: formData.dInterestRate === "" ? 0 : Number(formData.dInterestRate),
        nTermMonths: formData.nTermMonths ? Number(formData.nTermMonths) : null,
        dMonthlyPayment:
          formData.dMonthlyPayment === "" ? null : Number(formData.dMonthlyPayment),
        dStartDate: formData.dStartDate,
        nPaymentDay: formData.nPaymentDay ? Number(formData.nPaymentDay) : null,
        /* Status isn't a form field. New loans are created DEFAULTED —
           setting them Active later posts the schedule to the Ledger;
           editing keeps whatever status the row already has. */
        cStatus: editingLoan ? formData.cStatus : "DEFAULTED",
        strNotes: formData.strNotes?.trim() || null,
      };

      if (editingLoan) {
        await loanService.update(editingLoan.nLoanId, payload);
        /* If this loan was already activated (its schedule is on the
           Ledger), refresh the schedule to match the edited terms:
           replace its Loan entries with the new ones. */
        const all = await ledgerService.list();
        const posted = (all || []).filter(
          (e) => e.cType === "LN" && e.nLoanId === editingLoan.nLoanId
        );
        if (posted.length > 0) {
          for (const entry of posted) {
            await ledgerService.remove(entry.nLedgerId);
          }
          const schedule = loanSchedule(payload);
          if (schedule) {
            /* Loan entries carry the "Loan Proceeds" category and the
               lender as Merchant (no account — they're loan-level). */
            const categoryId = await ensureCategory("Loan Proceeds");
            for (const entry of schedule) {
              await ledgerService.create({
                strTitle: `${payload.strName} — ${entry.label}`,
                cType: "LN",
                dAmount: Number(entry.amount.toFixed(2)),
                dFee: 0,
                dTransactionDate: entry.date,
                nAccountId: null,
                nLoanId: editingLoan.nLoanId,
                nCategoryId: categoryId,
                strMerchant: payload.strLender || null,
                cStatus: "POSTED",
              });
            }
          }
        }
        showToast("Loan updated successfully!");
      } else {
        await loanService.create(payload);
        showToast("Loan created successfully!");
      }

      handleCloseModal();
      await fetchLoans();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save loan", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLoan = async (id) => {
    if (!window.confirm("Are you sure you want to delete this loan? Its entries will also be removed from the Ledger.")) return;

    try {
      /* Remove the loan's Ledger entries first (schedule payments and
         anything else linked via nLoanId), then the loan itself. */
      const all = await ledgerService.list();
      const linked = (all || []).filter((e) => e.nLoanId === id);
      for (const entry of linked) {
        await ledgerService.remove(entry.nLedgerId);
      }
      await loanService.remove(id);
      showToast("Loan and its ledger entries deleted!");
      await fetchLoans();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete loan", "error");
    }
  };

  /* Popover-based status changer on the Actions cell. */
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
      /* Activating a loan posts its entries to the Ledger — one Loan
         (LN) entry per month, linked via nLoanId. Skipped if the
         schedule was already posted (no duplicates). */
      if (nextStatus === "ACTIVE") {
        const all = await ledgerService.list();
        const alreadyPosted = (all || []).some(
          (e) => e.cType === "LN" && e.nLoanId === row.nLoanId
        );
        if (!alreadyPosted) {
          const schedule = loanSchedule(row);
          if (schedule) {
            /* Loan entries carry the "Loan Proceeds" category and the
               lender as Merchant (no account — they're loan-level). */
            const categoryId = await ensureCategory("Loan Proceeds");
            for (const entry of schedule) {
              await ledgerService.create({
                strTitle: `${row.strName} — ${entry.label}`,
                cType: "LN",
                dAmount: Number(entry.amount.toFixed(2)),
                dFee: 0,
                dTransactionDate: entry.date,
                nAccountId: null,
                nLoanId: row.nLoanId,
                nCategoryId: categoryId,
                strMerchant: row.strLender || null,
                cStatus: "POSTED",
              });
            }
          }
        }
      }
      await loanService.update(row.nLoanId, { cStatus: nextStatus });
      showToast("Status updated successfully!");
      await fetchLoans();
    } catch (err) {
      console.error("Status change error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  const columns = [
    {
      id: "strName",
      label: "Loan",
      minWidth: 200,
      format: (_, row) => {
        /* Tinted handshake circle on the left, colored by the loan's
           status, with a status dot pinned on its upper-right edge
           (Ledger/Accounts-style); name + lender caption on the right. */
        const meta = STATUS_META[row.cStatus] || { color: "var(--text-muted)" };
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
              <LoanIcon />
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
                  backgroundColor: meta.color,
                  border: "1.5px solid var(--card-bg)",
                }}
              />
            </Box>
            <Box sx={{ minWidth: 0 }}>
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
                {row.strName || "—"}
              </Typography>
              {/* Start - End sits directly under the title, above the
                  lender: the end comes from the last schedule month
                  (payment day, clamped) — omitted when the schedule
                  can't be derived. */}
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
                  prettyDate(row.dStartDate),
                  loanSchedule(row)?.at(-1) ? prettyDate(loanSchedule(row).at(-1).date) : null,
                ]
                  .filter(Boolean)
                  .join(" - ") || "—"}
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
                {row.strLender || "—"}
              </Typography>
            </Box>
          </Stack>
        );
      },
    },
    {
      id: "dPrincipal",
      label: "Principal",
      minWidth: 130,
      align: "right",
      format: (value, row) => {
        /* The loan's total interest cost: rate loans charge the flat
           rate on the FULL principal every month (principal × rate% ×
           term); fixed-payment loans are monthly × term − principal
           (same result, from the other side). */
        const term = Number(row.nTermMonths);
        const principal = Number(row.dPrincipal || 0);
        const rate = row.dInterestRate != null ? Number(row.dInterestRate) : null;
        const monthly = row.dMonthlyPayment != null ? Number(row.dMonthlyPayment) : null;
        const interest =
          rate != null && term > 0
            ? principal * (rate / 100) * term
            : monthly != null && term > 0
              ? Math.max(0, monthly * term - principal)
              : null;
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {`Amount: ${peso(value)}`}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {rate != null ? `Int(${rate}%): ${peso(interest ?? 0)}` : `Int: ${peso(interest ?? 0)}`}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "var(--text-primary)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {peso(Number(value || 0) + Number(interest || 0))}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "dMonthlyPayment",
      label: "Monthly",
      minWidth: 130,
      align: "right",
      format: (value, row) => {
        /* Same three-line shape as the Principal column: the two
           per-month components, then the larger total. Rate loans:
           the month's principal share (principal ÷ term) + the flat
           interest on the FULL principal (principal × rate%).
           Fixed-payment loans can't be split that way, so they fall
           back to Monthly + terms captions over the amount. */
        const term = Number(row.nTermMonths);
        const principal = Number(row.dPrincipal || 0);
        const rate = row.dInterestRate != null ? Number(row.dInterestRate) : null;
        const total = value != null ? Number(value) : loanSchedule(row)?.[0]?.amount ?? null;
        const terms = [
          row.nTermMonths ? `${row.nTermMonths} mo` : null,
          rate != null ? `${rate}%` : null,
        ]
          .filter(Boolean)
          .join(" • ");
        if (rate != null && term > 0 && total != null) {
          const share = principal / term;
          const intShare = principal * (rate / 100);
          return (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {`Principal: ${peso(share)}`}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {`Int(${rate}%): ${peso(intShare)}`}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {peso(total)}
              </Typography>
            </Box>
          );
        }
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {`Monthly: ${peso(total)}`}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {terms || "—"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "var(--text-primary)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {peso(total ?? 0)}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "paid",
      label: "Status",
      minWidth: 130,
      align: "right",
      format: (_, row) => {
        /* Same three-line shape as the other columns: Paid so far,
           what's Left, and the larger term progress (paid months of
           the term, e.g. 2/12). Lifetime total = monthly × term —
           identical to Principal + Int. */
        const term = Number(row.nTermMonths);
        const principal = Number(row.dPrincipal || 0);
        const rate = row.dInterestRate != null ? Number(row.dInterestRate) : null;
        const monthly = row.dMonthlyPayment != null ? Number(row.dMonthlyPayment) : null;
        const lifetime =
          rate != null && term > 0
            ? principal * (1 + (rate / 100) * term)
            : monthly != null && term > 0
              ? monthly * term
              : null;
        const paid = paidTotals.get(row.nLoanId) ?? 0;
        const paidCount = paidCounts.get(row.nLoanId) ?? 0;
        const left = lifetime != null ? Math.max(0, lifetime - paid) : null;
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: paid ? "#2e7d32" : "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {`Paid: ${peso(paid)}`}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {`Left: ${left != null ? peso(left) : "—"}`}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: paidCount ? "#2e7d32" : "var(--text-muted)",
                fontWeight: 600,
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {term > 0 ? `${paidCount}/${term}` : "—"}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => {
        const status = STATUS_META[row.cStatus] || { label: row.cStatus, color: "var(--text-muted)" };
        /* Status changer: opens a tooltip-style popover listing the
           statuses; picking one updates the row directly. Rendered
           between Edit and Delete via RowActions' extra slot. */
        const statusButton = (
          <Tooltip title={`Change status (now: ${status.label})`} arrow>
            <IconButton
              size="small"
              aria-label={`Change status of ${row.strName || "loan"}`}
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
        );
        /* View button — visible on ACTIVE loans only (before Edit).
            Opens the loan's Ledger entries viewer. */
        const viewButton =
          row.cStatus === "ACTIVE" ? (
            <Tooltip title="View loan entries in Ledger" arrow>
              <IconButton
                size="small"
                aria-label={`View ${row.strName || "loan"} entries`}
                onClick={() => setViewLoan(row)}
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
          ) : null;
        /* Edit is only for DEFAULTED loans — an Active loan is a
           running schedule, not something to hand-edit. Delete is also
           hidden once the loan has at least one PAID entry: deleting
           cascades its Ledger entries, which would erase paid history
           (marking entries unpaid from the viewer brings it back). */
        const canEdit = row.cStatus === "DEFAULTED";
        const hasPaid = paidLoanIds.has(row.nLoanId);
        return (
          <RowActions
            label={row.strName || "loan"}
            leading={viewButton}
            extra={statusButton}
            onEdit={canEdit ? () => handleOpenEdit(row) : undefined}
            onDelete={canEdit && !hasPaid ? () => handleDeleteLoan(row.nLoanId) : undefined}
          />
        );
      },
    },
  ];

  const visibleRows = useMemo(
    () => loans.filter((l) => statusFilter === "all" || l.cStatus === statusFilter),
    [loans, statusFilter]
  );

  const statusCounts = useMemo(
    () => buildCounts(loans, "cStatus", STATUS_FILTER_OPTIONS),
    [loans]
  );

  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          aria-label="Add loan"
          sx={ADD_BUTTON_SX}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Loan
          </Box>
        </Button>
      </Stack>
    ),
    [handleOpenAdd]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      {/* Collapsible filter card — same pattern as the Ledger/Accounts: a
          "Filter by:" header row that toggles the Status group below it,
          and shows the active selection when collapsed. */}
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
            {!filtersOpen && statusFilter !== "all" && (
              <Box
                component="span"
                sx={{ ml: 1, textTransform: "none", fontWeight: 500, color: "var(--accent)" }}
              >
                {STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label}
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
        rowKey="nLoanId"
        searchPlaceholder="Search by name or lender..."
        searchFields={["strName", "strLender"]}
      />

      {/* Tooltip-style popover on the Actions status button. */}
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
                sx={{ borderRadius: 1.5, gap: 1 }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: meta.color, flexShrink: 0 }}
                />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {opt.label}
                </Typography>
                {isCurrent && <CheckIcon sx={{ fontSize: 16, color: "var(--text-muted)" }} />}
              </ListItemButton>
            );
          })}
      </Popover>

      <LoansAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveLoan}
        editingLoan={editingLoan}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      {/* A loan's Ledger entries (Active loans, via the 👁 button).
          onDataChange re-syncs the page after PAY/UNPAID so the Delete
          button reappears/disappears with the loan's paid state. */}
      <ViewLoanLedgerEntries
        open={Boolean(viewLoan)}
        onClose={() => setViewLoan(null)}
        loan={viewLoan}
        onDataChange={fetchLoans}
      />

      {toastNode}
    </Box>
  );
}
