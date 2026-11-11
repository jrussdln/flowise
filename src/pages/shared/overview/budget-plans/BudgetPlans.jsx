/* ------------------------------------------------------------------
   Budget Plans — the page behind the dashboard's BUDGET PLANS button.

   A budget plan is a NAMED PLAN: title, description, status, colour and
   favourite flag. It carries no amount, has no deposits, and never
   writes a row to tbltransactions — it lives entirely in
   `tblbudgetplan` and is managed with plain CRUD calls
   (src/services/budgetPlanService.js).

   The page is a card grid, exactly like the Savings tab: search, a
   status filter, an add/edit dialog, per-card Edit / Delete / favourite
   actions and a status badge (Pending -> Activate -> Completed).

   `onBack` returns to the dashboard (the dashboard swaps this page in
   place of its own body, the same way it does for Bills and Metrics).
   ------------------------------------------------------------------ */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  PieChart as BudgetPlansIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import BudgetPlanCard from "./components/BudgetPlanCard";
import BudgetPlanAEModal from "./modal/BudgetPlanAEModal";
import BudgetPlanEntriesModal from "./modal/BudgetPlanEntriesModal";
import BudgetPlanUsedPlanModal from "./modal/BudgetPlanUsedPlanModal";
import FilterMenu from "../../../../components/ui/FilterMenu";
import { sortCards } from "../../../../lib/cards";
import { CardGridSkeleton } from "../../../../components/ui/AppSkeleton";
import { budgetPlanService } from "../../../../services/budgetPlanService";

/* tblbudgetplan.cStatus — a plan is Active while it is being planned,
   "C" once it has been USED (its entries became expenses). */
const PLAN_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "A", label: "Active" },
  { value: "C", label: "Used" },
  { value: "P", label: "Pending" },
];

/* Active = a plan that has not been used yet. */
const isActivePlan = (plan) => plan.cStatus !== "C" && plan.cStatus !== "P";

const glassCard = {
  borderRadius: 3,
  backgroundColor: "var(--glass-bg-strong)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-medium)",
  boxShadow: "var(--glass-shadow)",
};

export default function BudgetPlans({ onBack }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewPlan, setViewPlan] = useState(null); // opened by View
  const [usePlan, setUsePlan] = useState(null); // opened by Used Plan
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  /* options.silent refreshes the cards without flashing the grid's
     loading state — used when a favourite is toggled. */
  const fetchPlans = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await budgetPlanService.list();
      setPlans(data || []);
    } catch (err) {
      console.error("Error fetching budget plans:", err);
      showToast(err.message || "Failed to load budget plans", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  /* Favourites pin above everything; the rest stay newest-first. The
     status filter and search term narrow the list. */
  const visiblePlans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortCards(
      plans
        .filter(
          (p) =>
            statusFilter === "all" ||
            (statusFilter === "A" ? isActivePlan(p) : p.cStatus === statusFilter)
        )
        .filter(
          (p) =>
            !term ||
            (p.strTitle || "").toLowerCase().includes(term) ||
            (p.strCode || "").toLowerCase().includes(term) ||
            (p.strDescription || "").toLowerCase().includes(term)
        ),
      "nBudgetPlanId"
    );
  }, [plans, statusFilter, searchTerm]);

  const handleOpenAdd = () => {
    setEditingPlan(null);
    setFormData({
      strTitle: "",
      strDescription: "",
      dBudgetAmount: "",
      strColor: "",
      bIsFavorite: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setFormData({
      strTitle: plan.strTitle || "",
      strDescription: plan.strDescription || "",
      dBudgetAmount: plan.dBudgetAmount == null ? "" : String(plan.dBudgetAmount),
      strColor: plan.strColor || "",
      bIsFavorite: plan.bIsFavorite === true,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingPlan(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSavePlan = async () => {
    if (!formData.strTitle?.trim()) {
      showToast("Title is required.", "warning");
      return;
    }

    const payload = {
      strTitle: formData.strTitle.trim(),
      strDescription: formData.strDescription?.trim() || null,
      /* The plan's own figure — an empty field clears it (null). */
      dBudgetAmount:
        formData.dBudgetAmount === "" || formData.dBudgetAmount == null
          ? null
          : Number(formData.dBudgetAmount),
      /* Cosmetic columns (see src/lib/cards.js) — the server keeps a
         colour code and a real boolean, or null when cleared. */
      strColor: formData.strColor?.trim() || null,
      bIsFavorite: formData.bIsFavorite === true,
    };

    setSaving(true);
    try {
      if (editingPlan) {
        await budgetPlanService.update(editingPlan.nBudgetPlanId, payload);
        showToast("Budget plan updated successfully!");
      } else {
        await budgetPlanService.create(payload);
        showToast("Budget plan created — pending activation.");
      }

      handleCloseModal();
      await fetchPlans();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save budget plan", "error");
    } finally {
      setSaving(false);
    }
  };

  /* USED PLAN — the plan's entries become expenses in the ledger: each
     line item is written as an Expense transaction and linked from its
     entry, and the entries lock until the plan is activated again.

     The money step lives in BudgetPlanUsedPlanModal: it asks where the
     plan's total comes from (the current balance or a debit card) and
     refuses to go through when the chosen source cannot cover it. */
  const handleUsePlan = async ({ cardId } = {}) => {
    if (!usePlan) return;

    try {
      await budgetPlanService.update(usePlan.nBudgetPlanId, {
        cStatus: "C",
        /* The debit card the plan is paid from (when the modal's Pay With
           panel picked one) — its balance takes the deduction. */
        ...(cardId ? { nCardId: cardId } : {}),
      });
      showToast("Plan used — its entries are now expenses in Transactions.");
      setUsePlan(null);
      await fetchPlans();
    } catch (err) {
      console.error("Use plan error:", err);
      showToast(err.message || "Failed to use the plan", "error");
    }
  };

  /* Activate again — the plan goes back to Active and the expenses its
     entries wrote are taken out of the ledger. */
  const handleActivate = async (plan) => {
    if (
      !window.confirm(
        "Activate this budget plan again? The expenses its entries wrote will be removed from Transactions, and its entries become editable again."
      )
    ) {
      return;
    }

    try {
      await budgetPlanService.update(plan.nBudgetPlanId, { cStatus: "A" });
      showToast("Plan activated — its expenses were removed from Transactions.");
      await fetchPlans();
    } catch (err) {
      console.error("Activate plan error:", err);
      showToast(err.message || "Failed to activate the plan", "error");
    }
  };

  /* Star toggle — one cosmetic column, written straight back. */
  const handleToggleFavorite = async (plan) => {
    try {
      await budgetPlanService.update(plan.nBudgetPlanId, {
        bIsFavorite: plan.bIsFavorite !== true,
      });
      await fetchPlans({ silent: true });
    } catch (err) {
      console.error("Favourite error:", err);
      showToast(err.message || "Failed to update favourite", "error");
    }
  };

  const handleDeletePlan = async (id) => {
    if (!window.confirm("Are you sure you want to delete this budget plan?")) return;

    try {
      await budgetPlanService.remove(id);
      showToast("Budget plan deleted successfully!");
      await fetchPlans();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete budget plan", "error");
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
          <BudgetPlansIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
          {/* Breadcrumb — DASHBOARD takes you back, BUDGET PLANS is where
              you are. */}
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
              Budget Plans
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Search budget plans..."
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
            options={PLAN_FILTER_OPTIONS}
            counts={{
              all: plans.length,
              A: plans.filter(isActivePlan).length,
              C: plans.filter((p) => p.cStatus === "C").length,
              P: plans.filter((p) => p.cStatus === "P").length,
            }}
            label="Filter budget plans by status"
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
              New Plan
            </Box>
          </Button>
        </Stack>
      </Stack>

      {loading && plans.length === 0 && <CardGridSkeleton count={6} />}

      {!loading && visiblePlans.length === 0 && (
        <Paper elevation={0} sx={{ ...glassCard, p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "var(--text-primary)" }}>
            {plans.length === 0 ? "No budget plans yet" : "No budget plans match this filter"}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--text-muted)", mt: 0.5 }}>
            {plans.length === 0
              ? "Create your first budget plan to get started."
              : "Try a different filter or search term."}
          </Typography>
        </Paper>
      )}

      {visiblePlans.length > 0 && (
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
          {visiblePlans.map((plan) => (
            <BudgetPlanCard
              key={plan.nBudgetPlanId}
              plan={plan}
              onUse={(p) => setUsePlan(p)}
              onActivate={handleActivate}
              onEdit={handleOpenEdit}
              onView={(p) => setViewPlan(p)}
              onDelete={() => handleDeletePlan(plan.nBudgetPlanId)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </Box>
      )}

      <BudgetPlanAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSavePlan}
        editingPlan={editingPlan}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <BudgetPlanEntriesModal
        open={Boolean(viewPlan)}
        plan={viewPlan}
        onClose={() => {
          setViewPlan(null);
          // The plan's total on the card behind this modal changed.
          fetchPlans({ silent: true });
        }}
      />

      <BudgetPlanUsedPlanModal
        open={Boolean(usePlan)}
        plan={usePlan}
        onClose={() => setUsePlan(null)}
        onConfirm={handleUsePlan}
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
