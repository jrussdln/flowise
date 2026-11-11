import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AccountBalance as AccountBalanceIcon,
  Add as AddIcon,
  Cancel as CancelIcon,
  CheckCircle as ActivateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import LoanAEModal from "./modals/LoanAEModal";
import LoanEntriesModal from "./modals/LoanEntriesModal";
import FilterMenu from "../../../components/ui/FilterMenu";
import { dueRange, overdueTerms } from "../../../lib/loanSchedule";
import { cardColor, isFavorite, sortCards } from "../../../lib/cards";
import { CardGridSkeleton } from "../../../components/ui/AppSkeleton";
import { loanService } from "../../../services/loanService";

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

/* Due-date arithmetic (nthDue / dueRange / overdueTerms) lives in
 * src/lib/loanSchedule.js and is shared with LoanEntriesModal.jsx. */

/* cInterestType: D = Daily, W = Weekly, M = Monthly, A = Annual. */
const PERIOD_META = {
  D: "Daily",
  W: "Weekly",
  M: "Monthly",
  A: "Annual",
};

const STATUS_META = {
  P: { label: "Pending", color: "#ed6c02", bg: "rgba(237, 108, 2, 0.14)" },
  A: { label: "Active", color: "#2e7d32", bg: "rgba(46, 125, 50, 0.14)" },
  C: { label: "Completed", color: "#1565c0", bg: "rgba(21, 101, 192, 0.14)" },
};

const glassCard = {
  borderRadius: 3,
  backgroundColor: "var(--glass-bg-strong)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-medium)",
  boxShadow: "var(--glass-shadow)",
};

const LOAN_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "A", label: "Active" },
  { value: "P", label: "Pending" },
  { value: "C", label: "Completed" },
];

/** label / value row inside a loan card. Left-aligned as a pair
 *  ("Terms 3 × Monthly"), never pushed apart across the card. */
function MetaRow({ label, value, valueColor }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
      <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: valueColor || "var(--text-primary)", fontWeight: 600 }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/** One loan card — code, status, amount, paid/total progress, terms,
 *  due date + actions. The top-right holds ONE row of icons: View
 *  (entries) on Active/Completed cards, Edit, Delete, then the favourite
 *  star at the far right. An ACTIVE loan keeps Edit — it just opens the
 *  dialog with the schedule fields removed (title / colour / description
 *  / favourite only) — but Delete stays hidden until Cancel drops it
 *  back to Pending. The status toggle rides as a pill badge on the
 *  bottom (created-date) row, pinned to the lower-right corner
 *  (Pending -> Activate, Active -> Cancel).
 *  Cosmetics: `strColor` paints an accent bar (and the code), and the
 *  star pins the card to the top of the grid. */
function LoanCard({ loan, onActivate, onCancel, onView, onEdit, onDelete, onToggleFavorite }) {
  const status = STATUS_META[loan.cStatus] || {
    label: loan.cStatus || "—",
    color: "var(--text-muted)",
    bg: "transparent",
  };
  /* strColor (a colour code — see src/lib/cards.js) -> accent bar down
     the card's left edge + the code beside the status chip. */
  const accent = cardColor(loan);
  const favorite = isFavorite(loan);
  const due = dueRange(loan);
  /* Flags the card as soon as ONE term slips (the same helper that feeds
     the Overdue Payments KPI), not only once the whole schedule elapsed. */
  const overdue = overdueTerms(loan) > 0;
  /* "1/12 paid · ₱…" — settled vs total entries (terms before activation). */
  const paidCount = Number(loan.nEntriesPaid) || 0;
  const totalCount = Number(loan.nEntriesTotal) || Number(loan.nTerms) || 0;
  const allSettled = totalCount > 0 && paidCount >= totalCount;
  /* Active loans keep their schedule: Delete is hidden until Cancel
     drops them back to Pending, and Edit opens the dialog with only the
     presentation fields (see LoanAEModal). */
  const locked = loan.cStatus === "A";
  /* Entries only exist once the loan has been activated. */
  const canView = loan.cStatus === "A" || loan.cStatus === "C";
  /* Status badge on the footer date row. Pending loans activate; an
     Active loan can be cancelled back to Pending (A completes on its
     own when the last entry is paid, so Completed never toggles). */
  const badge =
    loan.cStatus === "P"
      ? {
          label: "Activate",
          color: "#2e7d32",
          icon: <ActivateIcon />,
          onClick: () => onActivate(loan),
        }
      : loan.cStatus === "A"
        ? {
            label: "Cancel",
            color: "#c62828",
            icon: <CancelIcon />,
            onClick: () => onCancel(loan),
          }
        : null;

  return (
    <Paper
      elevation={0}
      sx={{
        ...glassCard,
        p: 2.5,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        /* Overrides glassCard's 1px left border with the card's colour. */
        ...(accent ? { borderLeft: `4px solid ${accent}` } : {}),
      }}
    >
      {/* Header: code + status chip on the left, the icon actions on the
          top-right. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            flexWrap: "wrap",
            rowGap: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: accent || "var(--text-muted)",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {loan.strCode || `Loan #${loan.nLoanId}`}
          </Typography>
          <Chip
            size="small"
            label={status.label}
            sx={{
              bgcolor: status.bg,
              color: status.color,
              fontWeight: 600,
              fontSize: "0.72rem",
            }}
          />
        </Stack>

        {/* ONE row of icons: View / Edit / Delete on the LEFT, the
            favourite star closing it on the right. */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          {canView && (
            <Tooltip title="View entries">
              <IconButton size="small" aria-label="View entries" onClick={() => onView(loan)}>
                <ViewIcon fontSize="small" sx={{ color: "var(--accent)" }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Edit is on every card — an Active loan opens it with the
              schedule fields removed (title / colour / description). */}
          <Tooltip title={locked ? "Edit title / colour / description" : "Edit"}>
            <IconButton size="small" aria-label="Edit" onClick={() => onEdit(loan)}>
              <EditIcon fontSize="small" sx={{ color: "var(--accent)" }} />
            </IconButton>
          </Tooltip>
          {!locked && (
            <Tooltip title="Delete">
              <IconButton size="small" aria-label="Delete" onClick={() => onDelete(loan)}>
                <DeleteIcon fontSize="small" sx={{ color: "#f44336" }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Favourite toggle — available on every card (pinning an
              Active loan is only cosmetic, never a schedule change). */}
          <Tooltip title={favorite ? "Remove from favourites" : "Add to favourites"}>
            <IconButton size="small" onClick={() => onToggleFavorite(loan)} sx={{ p: 0.5 }}>
              {favorite ? (
                <StarIcon sx={{ fontSize: 18, color: "#f9a825" }} />
              ) : (
                <StarBorderIcon sx={{ fontSize: 18, color: "var(--text-muted)" }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Stack>

      {/* Upper-case title — kept close to the code above it (just a
          touch larger than LON-0005's 0.75rem, and lighter), so the
          balance below stays the loudest thing on the card. The badge
          rides that balance row, right after the amount. */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 400,
          fontSize: "0.9rem",
          color: "var(--text-primary)",
          mt: 1,
          lineHeight: 1.35,
          textTransform: "uppercase",
        }}
      >
        {loan.strTitle || "Untitled loan"}
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 0.25, alignItems: "center" }}
      >
        <Typography
          sx={{
            fontSize: "1.125rem",
            lineHeight: 1.4,
            fontWeight: 700,
            color: "var(--accent)",
          }}
        >
          {money(loan.dRemaining)}
        </Typography>
        {totalCount > 0 && (
          <Chip
            size="small"
            label={`${paidCount}/${totalCount}`}
            sx={{
              height: 22,
              fontWeight: 700,
              fontSize: "0.72rem",
              color: allSettled ? "#2e7d32" : "var(--text-muted)",
              backgroundColor: allSettled ? "rgba(46, 125, 50, 0.14)" : "var(--overlay-dark)",
            }}
          />
        )}
      </Stack>

      {loan.strDescription && (
        <Typography
          variant="body2"
          sx={{
            color: "var(--text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {loan.strDescription}
        </Typography>
      )}

      <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "var(--text-muted)" }}>
        Amount {money(loan.dAmount)} · {Number(loan.dInterest) || 0}% interest
        {PERIOD_META[loan.cInterestType] ? ` · ${PERIOD_META[loan.cInterestType]}` : ""}
      </Typography>

      <Stack spacing={0.75} sx={{ mt: 2 }}>
        <MetaRow
          label="Terms"
          value={
            loan.nTerms && PERIOD_META[loan.cInterestType]
              ? `${loan.nTerms} × ${PERIOD_META[loan.cInterestType]}`
              : loan.nTerms
                ? String(loan.nTerms)
                : "—"
          }
        />
        <MetaRow
          label="Due date"
          value={`${due.text}${overdue ? " · Overdue" : ""}`}
          valueColor={overdue ? "#f44336" : undefined}
        />
      </Stack>

      <Box sx={{ flexGrow: 1 }} />

      {/* Footer: the created date with the status toggle pinned to the
          lower-right corner of the card. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MetaRow label="Created" value={formatDate(loan.dttCreated)} />
        </Box>
        {badge && (
          <Button
            size="small"
            variant="contained"
            startIcon={badge.icon}
            onClick={badge.onClick}
            sx={{
              minWidth: 0,
              flexShrink: 0,
              borderRadius: "999px",
              px: 1.4,
              py: 0.1,
              lineHeight: 1.6,
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "none",
              backgroundColor: badge.color,
              color: "#fff",
              boxShadow: "none",
              "& .MuiButton-startIcon": { mr: 0.5, "& svg": { fontSize: "0.9rem" } },
              "&:hover": { backgroundColor: badge.color, opacity: 0.9, boxShadow: "none" },
            }}
          >
            {badge.label}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("A");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewLoan, setViewLoan] = useState(null);
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  /* options.silent refreshes the cards without flashing the grid's
     loading state — used when the star toggles a favourite. */
  const fetchLoans = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await loanService.list();
      setLoans(data || []);
    } catch (err) {
      console.error("Error fetching loans:", err);
      showToast(err.message || "Failed to load loans", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  /* Favourites pin above everything; the rest stay newest-first. The
     status filter and search term narrow the list. */
  const visibleLoans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortCards(
      loans
        .filter((l) => statusFilter === "all" || l.cStatus === statusFilter)
        .filter(
          (l) =>
            !term ||
            (l.strTitle || "").toLowerCase().includes(term) ||
            (l.strCode || "").toLowerCase().includes(term) ||
            (l.strDescription || "").toLowerCase().includes(term)
        ),
      "nLoanId"
    );
  }, [loans, statusFilter, searchTerm]);

  const handleOpenAdd = () => {
    setEditingLoan(null);
    setFormData({
      strTitle: "",
      dAmount: "",
      nTerms: "",
      dttDueDate: "",
      cInterestType: "M",
      dInterest: "",
      strDescription: "",
      strColor: "",
      bIsFavorite: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (loan) => {
    setEditingLoan(loan);
    setFormData({
      strTitle: loan.strTitle || "",
      dAmount: loan.dAmount ?? "",
      nTerms: loan.nTerms ?? "",
      dttDueDate: loan.dttDueDate ? String(loan.dttDueDate).slice(0, 10) : "",
      cInterestType: loan.cInterestType || "M",
      dInterest: loan.dInterest ?? "",
      strDescription: loan.strDescription || "",
      strColor: loan.strColor || "",
      bIsFavorite: loan.bIsFavorite === true,
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
    if (!formData.strTitle?.trim()) {
      showToast("Title is required.", "warning");
      return;
    }

    /* An ACTIVE loan only takes presentation fields — amount / terms /
       due date / interest belong to a schedule that already exists, so
       the server would refuse them anyway. Skip those checks entirely
       and send the four editable fields. */
    const scheduleLocked = editingLoan?.cStatus === "A";

    let payload;
    if (scheduleLocked) {
      payload = {
        strTitle: formData.strTitle.trim(),
        strDescription: formData.strDescription?.trim() || null,
        strColor: formData.strColor?.trim() || null,
        bIsFavorite: formData.bIsFavorite === true,
      };
    } else {
      const amount = Number(formData.dAmount);
      if (formData.dAmount === "" || formData.dAmount === null || !Number.isFinite(amount)) {
        showToast("Amount must be a valid number.", "warning");
        return;
      }
      if (amount <= 0) {
        showToast("Loan amount must be greater than zero.", "warning");
        return;
      }

      const terms = Number(formData.nTerms);
      if (formData.nTerms === "" || formData.nTerms === null || !Number.isInteger(terms)) {
        showToast("Terms must be a whole number.", "warning");
        return;
      }
      if (terms < 1) {
        showToast("Terms must be at least 1.", "warning");
        return;
      }

      if (!PERIOD_META[formData.cInterestType]) {
        showToast("Please choose an interest period.", "warning");
        return;
      }

      const interest = Number(formData.dInterest);
      if (formData.dInterest === "" || formData.dInterest === null || !Number.isFinite(interest)) {
        showToast("Interest rate must be a valid number.", "warning");
        return;
      }
      if (interest < 0) {
        showToast("Interest rate cannot be negative.", "warning");
        return;
      }

      if (!formData.dttDueDate) {
        showToast("Due date is required.", "warning");
        return;
      }

      payload = {
        strTitle: formData.strTitle.trim(),
        dAmount: amount,
        nTerms: terms,
        dttDueDate: formData.dttDueDate,
        cInterestType: formData.cInterestType,
        dInterest: interest,
        strDescription: formData.strDescription?.trim() || null,
        /* Cosmetic columns (see src/lib/cards.js) — the server keeps a
           colour code (or a legacy hex) and a real boolean, or null
           when cleared. */
        strColor: formData.strColor?.trim() || null,
        bIsFavorite: formData.bIsFavorite === true,
      };
    }

    setSaving(true);
    try {
      if (editingLoan) {
        await loanService.update(editingLoan.nLoanId, payload);
        showToast("Loan updated successfully!");
      } else {
        await loanService.create(payload);
        showToast("Loan created — pending activation.");
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

  /* Activation = a partial update flipping cStatus P -> A (server-owned). */
  const handleActivateLoan = async (loan) => {
    if (!window.confirm("Activate this loan? It will move from Pending to Active.")) return;

    try {
      await loanService.update(loan.nLoanId, { cStatus: "A" });
      showToast("Loan activated!");
      await fetchLoans();
    } catch (err) {
      console.error("Activate error:", err);
      showToast(err.message || "Failed to activate loan", "error");
    }
  };

  /* Cancel = a partial update flipping cStatus A -> P (server-owned).
     The server clears the schedule AND the Payment rows it generated
     with it, so the card drops back to Pending where Edit / Delete
     show up again (the loan can then be edited or removed outright). */
  const handleCancelLoan = async (loan) => {
    if (
      !window.confirm(
        "Cancel this loan? Its payment schedule and the payment entries it generated will be removed. The loan goes back to Pending, where you can edit or delete it."
      )
    )
      return;

    try {
      await loanService.update(loan.nLoanId, { cStatus: "P" });
      showToast("Loan cancelled — back to Pending.");
      await fetchLoans();
    } catch (err) {
      console.error("Cancel error:", err);
      showToast(err.message || "Failed to cancel loan", "error");
    }
  };

  /* Star toggle — one cosmetic column, so the server skips the
     schedule sync and just writes the flag back. */
  const handleToggleFavorite = async (loan) => {
    try {
      await loanService.update(loan.nLoanId, { bIsFavorite: loan.bIsFavorite !== true });
      await fetchLoans({ silent: true });
    } catch (err) {
      console.error("Favourite error:", err);
      showToast(err.message || "Failed to update favourite", "error");
    }
  };

  const handleDeleteLoan = async (id) => {
    if (!window.confirm("Are you sure you want to delete this loan?")) return;

    try {
      await loanService.remove(id);
      showToast("Loan deleted successfully!");
      await fetchLoans();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete loan", "error");
    }
  };

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 2,
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <AccountBalanceIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
          <Typography
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
            Loans
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Search loans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: "var(--text-muted)" }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              minWidth: { xs: 100, sm: 220 },
              flex: 1,
              "& .MuiOutlinedInput-root": {
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: 3,
                "& fieldset": { borderColor: "var(--border-medium)" },
                "&:hover fieldset": { borderColor: "var(--accent)" },
                "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
              },
            }}
          />
          <FilterMenu
            value={statusFilter}
            onChange={setStatusFilter}
            options={LOAN_FILTER_OPTIONS}
            counts={{
              all: loans.length,
              A: loans.filter((l) => l.cStatus === "A").length,
              P: loans.filter((l) => l.cStatus === "P").length,
              C: loans.filter((l) => l.cStatus === "C").length,
            }}
            label="Filter loans by status"
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            sx={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 3,
              px: { xs: 1.5, sm: 2 },
              justifyContent: { xs: "center", sm: "flex-start" },
              boxShadow: "none",
              "& .MuiButton-startIcon": { m: { xs: 0, sm: "0 8px 0 -4px" } },
              "&:hover": { backgroundColor: "var(--accent)", opacity: 0.9 },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              New Loan
            </Box>
          </Button>
        </Stack>
      </Stack>

      {loading && loans.length === 0 && <CardGridSkeleton count={6} />}

      {!loading && visibleLoans.length === 0 && (
        <Paper elevation={0} sx={{ ...glassCard, p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "var(--text-primary)" }}>
            {loans.length === 0 ? "No loans yet" : "No loans match this filter"}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--text-muted)", mt: 0.5 }}>
            {loans.length === 0
              ? "Create your first loan to get started."
              : "Try a different filter or search term."}
          </Typography>
        </Paper>
      )}

      {visibleLoans.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(auto-fill, minmax(280px, 1fr))",
            },
            gap: 2.5,
          }}
        >
          {visibleLoans.map((loan) => (
            <LoanCard
              key={loan.nLoanId}
              loan={loan}
              onActivate={handleActivateLoan}
              onCancel={handleCancelLoan}
              onView={setViewLoan}
              onEdit={handleOpenEdit}
              onDelete={() => handleDeleteLoan(loan.nLoanId)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </Box>
      )}

      <LoanAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveLoan}
        editingLoan={editingLoan}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <LoanEntriesModal
        open={Boolean(viewLoan)}
        onClose={() => {
          setViewLoan(null);
          fetchLoans(); // pick up a loan that auto-completed while paying
        }}
        loan={viewLoan}
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
