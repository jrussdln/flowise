import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { Savings as SavingsIcon, Add as AddIcon } from "@mui/icons-material";
import Table from "../../../../../components/ui/Table";
import FilterMenu from "../../../../../components/ui/FilterMenu";
import SavingsAEModal from "./SavingsAEModal";
import { savingsService } from "../../../../../services/savingsService";
import { useContentChrome } from "../../../../../hooks/usePageChrome";
import {
  ADD_BUTTON_SX,
  PillBadge,
  RowActions,
  buildCounts,
  contentHeader,
  useToast,
} from "../../shared";

const CONTENT_HEADER = contentHeader(SavingsIcon, "Savings");

const STATUS_META = {
  ACTIVE: { label: "Active", color: "#2e7d32" },
  REACHED: { label: "Reached", color: "#1565c0" },
  CLOSED: { label: "Closed", color: "var(--text-muted)" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "REACHED", label: "Reached" },
  { value: "CLOSED", label: "Closed" },
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

export default function Savings() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const { showToast, toastNode } = useToast();

  const handleOpenAdd = useCallback(() => {
    setEditingGoal(null);
    setFormData({
      strName: "",
      dTargetAmount: "",
      dTargetDate: "",
      cStatus: "ACTIVE",
      strNotes: "",
    });
    setModalOpen(true);
  }, []);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await savingsService.list();
      setGoals(data || []);
    } catch (err) {
      console.error("Error fetching savings goals:", err);
      showToast(err.message || "Failed to load savings goals", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleOpenEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      strName: goal.strName || "",
      dTargetAmount: goal.dTargetAmount ?? "",
      dTargetDate: goal.dTargetDate || "",
      cStatus: goal.cStatus || "ACTIVE",
      strNotes: goal.strNotes || "",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingGoal(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveGoal = async () => {
    if (!formData.strName?.trim()) {
      showToast("Goal name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        strName: formData.strName.trim(),
        dTargetAmount: formData.dTargetAmount === "" ? null : Number(formData.dTargetAmount),
        dTargetDate: formData.dTargetDate || null,
        cStatus: formData.cStatus,
        strNotes: formData.strNotes?.trim() || null,
      };

      if (editingGoal) {
        await savingsService.update(editingGoal.nSavingsId, payload);
        showToast("Savings goal updated successfully!");
      } else {
        await savingsService.create(payload);
        showToast("Savings goal created successfully!");
      }

      handleCloseModal();
      await fetchGoals();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save savings goal", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGoal = async (id) => {
    if (!window.confirm("Are you sure you want to delete this savings goal?")) return;

    try {
      await savingsService.remove(id);
      showToast("Savings goal deleted successfully!");
      await fetchGoals();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete savings goal", "error");
    }
  };

  const columns = [
    {
      id: "strName",
      label: "Goal",
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
            {row.strNotes || "—"}
          </Typography>
        </Box>
      ),
    },
    {
      id: "dTargetAmount",
      label: "Target",
      minWidth: 130,
      align: "right",
      format: (value) => (
        <Typography variant="body2" sx={{ color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          {peso(value)}
        </Typography>
      ),
    },
    {
      id: "dTargetDate",
      label: "Target Date",
      minWidth: 120,
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
          label={row.strName || "savings goal"}
          onEdit={() => handleOpenEdit(row)}
          onDelete={() => handleDeleteGoal(row.nSavingsId)}
        />
      ),
    },
  ];

  const visibleRows = useMemo(
    () => goals.filter((g) => statusFilter === "all" || g.cStatus === statusFilter),
    [goals, statusFilter]
  );

  const statusCounts = useMemo(
    () => buildCounts(goals, "cStatus", STATUS_FILTER_OPTIONS),
    [goals]
  );

  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <FilterMenu
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
          counts={statusCounts}
          label="Filter by goal status"
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          aria-label="Add savings goal"
          sx={ADD_BUTTON_SX}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Goal
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
        rowKey="nSavingsId"
        searchPlaceholder="Search goals..."
        searchFields={["strName", "strNotes"]}
      />

      <SavingsAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveGoal}
        editingGoal={editingGoal}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      {toastNode}
    </Box>
  );
}
