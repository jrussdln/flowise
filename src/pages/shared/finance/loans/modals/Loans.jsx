import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { RequestQuote as LoansIcon, Add as AddIcon } from "@mui/icons-material";
import Table from "../../../../../components/ui/Table";
import FilterMenu from "../../../../../components/ui/FilterMenu";
import LoansAEModal from "./LoansAEModal";
import { loanService } from "../../../../../services/loanService";
import { useContentChrome } from "../../../../../hooks/usePageChrome";
import {
  ADD_BUTTON_SX,
  PillBadge,
  RowActions,
  buildCounts,
  contentHeader,
  useToast,
} from "../../shared";

const CONTENT_HEADER = contentHeader(LoansIcon, "Loans");

const STATUS_META = {
  ACTIVE: { label: "Active", color: "#2e7d32" },
  PAID: { label: "Paid", color: "#1565c0" },
  DEFAULTED: { label: "Defaulted", color: "#d32f2f" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAID", label: "Paid" },
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
      dEndDate: "",
      nPaymentDay: "",
      cStatus: "ACTIVE",
      strNotes: "",
    });
    setModalOpen(true);
  }, []);

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loanService.list();
      setLoans(data || []);
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
      dEndDate: loan.dEndDate || "",
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
        dEndDate: formData.dEndDate || null,
        nPaymentDay: formData.nPaymentDay ? Number(formData.nPaymentDay) : null,
        cStatus: formData.cStatus,
        strNotes: formData.strNotes?.trim() || null,
      };

      if (editingLoan) {
        await loanService.update(editingLoan.nLoanId, payload);
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

  const columns = [
    {
      id: "strName",
      label: "Loan",
      minWidth: 200,
      format: (_, row) => (
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
              display: "flex",
              alignItems: "center",
              gap: 0.75,
            }}
          >
            {row.strName || "—"}
            <PillBadge meta={STATUS_META[row.cStatus]} fallback={row.cStatus} />
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
      ),
    },
    {
      id: "dPrincipal",
      label: "Principal",
      minWidth: 120,
      align: "right",
      format: (value) => (
        <Typography variant="body2" sx={{ color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          {peso(value)}
        </Typography>
      ),
    },
    {
      id: "dMonthlyPayment",
      label: "Monthly",
      minWidth: 120,
      align: "right",
      format: (value) => (
        <Typography variant="body2" sx={{ color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          {peso(value)}
        </Typography>
      ),
    },
    {
      id: "terms",
      label: "Terms",
      minWidth: 110,
      format: (_, row) => (
        <Typography variant="body2" sx={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {[
            row.nTermMonths ? `${row.nTermMonths} mo` : null,
            row.dInterestRate != null ? `${row.dInterestRate}%` : null,
          ]
            .filter(Boolean)
            .join(" • ") || "—"}
        </Typography>
      ),
    },
    {
      id: "dStartDate",
      label: "Start",
      minWidth: 110,
      format: (value) => (
        <Typography variant="body2" sx={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {prettyDate(value)}
        </Typography>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => (
        <RowActions
          label={row.strName || "loan"}
          onEdit={() => handleOpenEdit(row)}
          onDelete={() => handleDeleteLoan(row.nLoanId)}
        />
      ),
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
        <FilterMenu
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
          counts={statusCounts}
          label="Filter by loan status"
        />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleOpenAdd, statusFilter, statusCounts]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nLoanId"
        searchPlaceholder="Search by name or lender..."
        searchFields={["strName", "strLender"]}
      />

      <LoansAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveLoan}
        editingLoan={editingLoan}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      {toastNode}
    </Box>
  );
}
