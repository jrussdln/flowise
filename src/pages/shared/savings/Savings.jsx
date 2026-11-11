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
  Add as AddIcon,
  CheckCircle as ActivateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Savings as SavingsIcon,
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  TaskAlt as CompleteIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import SavingAEModal from "./modals/SavingAEModal";
import SavingEntriesModal from "./modals/SavingEntriesModal";
import FilterMenu from "../../../components/ui/FilterMenu";
import { cardColor, isFavorite, sortCards } from "../../../lib/cards";
import { CardGridSkeleton } from "../../../components/ui/AppSkeleton";
import { savingService } from "../../../services/savingService";

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

/* tblsavings.cStatus — the same vocabulary the Loans tab uses. */
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

const SAVING_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "A", label: "Active" },
  { value: "P", label: "Pending" },
  { value: "C", label: "Completed" },
];

/** label / value row inside a saving card. Left-aligned as a pair
 *  ("Created Oct 2, 2026"), never pushed apart across the card. */
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

/** One saving card — code, status, title, description, created + actions.
 *  The upper-right holds ONE row of icons: View (deposits) on Active and
 *  Completed cards, then Edit — on EVERY card, because the dialog only
 *  ever edits presentation fields (title / colour / description /
 *  favourite) — then Delete (hidden while the saving is Active, i.e.
 *  while deposits hang off it), with the favourite star closing the row
 *  on the right. The status toggle rides as a pill badge on the bottom
 *  row, right next to the created date (Pending -> Activate, Active ->
 *  Complete, Completed -> Activate again). Cosmetics: `strColor` paints
 *  an accent bar (and the code), and the star pins the card to the top
 *  of the grid. */
function SavingCard({
  saving,
  onActivate,
  onComplete,
  onReopen,
  onView,
  onEdit,
  onDelete,
  onToggleFavorite,
}) {
  const status = STATUS_META[saving.cStatus] || {
    label: saving.cStatus || "—",
    color: "var(--text-muted)",
    bg: "transparent",
  };
  /* strColor (a colour code — see src/lib/cards.js) -> accent bar down
     the card's left edge + the code beside the status chip. */
  const accent = cardColor(saving);
  const favorite = isFavorite(saving);
  /* Active savings hide Delete while deposits hang off them — but Edit
     stays, since the dialog only touches presentation fields. */
  const locked = saving.cStatus === "A";
  /* Deposits only show up once the saving has been activated. */
  const canView = saving.cStatus === "A" || saving.cStatus === "C";
  /* Status badge on the footer date row: Pending -> Activate, Active ->
     Complete, Completed -> Activate (reopens it, deposits and all). */
  const badge =
    saving.cStatus === "P"
      ? {
          label: "Activate",
          color: "#2e7d32",
          icon: <ActivateIcon />,
          onClick: () => onActivate(saving),
        }
      : saving.cStatus === "A"
        ? {
            label: "Complete",
            color: "#1565c0",
            icon: <CompleteIcon />,
            onClick: () => onComplete(saving),
          }
        : {
            label: "Activate",
            color: "#2e7d32",
            icon: <ActivateIcon />,
            onClick: () => onReopen(saving),
          };

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
            {saving.strCode || `Saving #${saving.nSavingId}`}
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
              <IconButton size="small" aria-label="View entries" onClick={() => onView(saving)}>
                <ViewIcon fontSize="small" sx={{ color: "var(--accent)" }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Edit is on every card — even while Active, since the dialog
              only holds title / colour / description (+ favourite). */}
          <Tooltip title="Edit">
            <IconButton size="small" aria-label="Edit" onClick={() => onEdit(saving)}>
              <EditIcon fontSize="small" sx={{ color: "var(--accent)" }} />
            </IconButton>
          </Tooltip>
          {!locked && (
            <Tooltip title="Delete">
              <IconButton size="small" aria-label="Delete" onClick={() => onDelete(saving)}>
                <DeleteIcon fontSize="small" sx={{ color: "#f44336" }} />
              </IconButton>
            </Tooltip>
          )}
          {/* Favourite toggle — available on every card (an Active saving
              is locked for edits, but pinning it is only cosmetic). */}
          <Tooltip title={favorite ? "Remove from favourites" : "Add to favourites"}>
            <IconButton size="small" onClick={() => onToggleFavorite(saving)} sx={{ p: 0.5 }}>
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
          touch larger than SAV-0001's 0.75rem, and lighter), so the
          balance below stays the loudest thing on the card. */}
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
        {saving.strTitle || "Untitled saving"}
      </Typography>
      <Typography
        sx={{
          fontSize: "1.125rem",
          lineHeight: 1.4,
          fontWeight: 700,
          color: "var(--accent)",
          mt: 0.25,
        }}
      >
        {money(saving.dBalance)}
      </Typography>

      {saving.strDescription && (
        <Typography
          variant="body2"
          sx={{
            color: "var(--text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {saving.strDescription}
        </Typography>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {/* Footer: the created date with the status toggle pinned bottom-right. */}
      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MetaRow label="Created" value={formatDate(saving.dttCreated)} />
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

export default function Savings() {
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("A");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewSaving, setViewSaving] = useState(null); // opened by View
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  /* options.silent refreshes the cards (balances) without flashing the
     grid's loading state — used when the entries modal closes. */
  const fetchSavings = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await savingService.list();
      setSavings(data || []);
    } catch (err) {
      console.error("Error fetching savings:", err);
      showToast(err.message || "Failed to load savings", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSavings();
  }, [fetchSavings]);

  /* Favourites pin above everything; the rest stay newest-first. The
     status filter and search term narrow the list. */
  const visibleSavings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortCards(
      savings
        .filter((s) => statusFilter === "all" || s.cStatus === statusFilter)
        .filter(
          (s) =>
            !term ||
            (s.strTitle || "").toLowerCase().includes(term) ||
            (s.strCode || "").toLowerCase().includes(term) ||
            (s.strDescription || "").toLowerCase().includes(term)
        ),
      "nSavingId"
    );
  }, [savings, statusFilter, searchTerm]);

  const handleOpenAdd = () => {
    setEditingSaving(null);
    setFormData({ strTitle: "", strDescription: "", strColor: "", bIsFavorite: false });
    setModalOpen(true);
  };

  const handleOpenEdit = (savingRow) => {
    setEditingSaving(savingRow);
    setFormData({
      strTitle: savingRow.strTitle || "",
      strDescription: savingRow.strDescription || "",
      strColor: savingRow.strColor || "",
      bIsFavorite: savingRow.bIsFavorite === true,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingSaving(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveSaving = async () => {
    if (!formData.strTitle?.trim()) {
      showToast("Title is required.", "warning");
      return;
    }

    const payload = {
      strTitle: formData.strTitle.trim(),
      strDescription: formData.strDescription?.trim() || null,
      /* Cosmetic columns (see src/lib/cards.js) — the server keeps a
         hex colour and a real boolean, or null when cleared. */
      strColor: formData.strColor?.trim() || null,
      bIsFavorite: formData.bIsFavorite === true,
    };

    setSaving(true);
    try {
      if (editingSaving) {
        await savingService.update(editingSaving.nSavingId, payload);
        showToast("Saving updated successfully!");
      } else {
        await savingService.create(payload);
        showToast("Saving created — pending activation.");
      }

      handleCloseModal();
      await fetchSavings();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save saving", "error");
    } finally {
      setSaving(false);
    }
  };

  /* Status changes are partial updates (server-owned cStatus). */
  const handleSetStatus = async (savingRow, cStatus, confirmText, doneText) => {
    if (!window.confirm(confirmText)) return;

    try {
      await savingService.update(savingRow.nSavingId, { cStatus });
      showToast(doneText);
      await fetchSavings();
    } catch (err) {
      console.error("Status error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  /* Star toggle — one cosmetic column, written straight back. */
  const handleToggleFavorite = async (savingRow) => {
    try {
      await savingService.update(savingRow.nSavingId, {
        bIsFavorite: savingRow.bIsFavorite !== true,
      });
      await fetchSavings({ silent: true });
    } catch (err) {
      console.error("Favourite error:", err);
      showToast(err.message || "Failed to update favourite", "error");
    }
  };

  const handleDeleteSaving = async (id) => {
    if (!window.confirm("Are you sure you want to delete this saving?")) return;

    try {
      await savingService.remove(id);
      showToast("Saving deleted successfully!");
      await fetchSavings();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete saving", "error");
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
          <SavingsIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
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
            Savings
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Search savings..."
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
            options={SAVING_FILTER_OPTIONS}
            counts={{
              all: savings.length,
              A: savings.filter((s) => s.cStatus === "A").length,
              P: savings.filter((s) => s.cStatus === "P").length,
              C: savings.filter((s) => s.cStatus === "C").length,
            }}
            label="Filter savings by status"
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
              New Saving
            </Box>
          </Button>
        </Stack>
      </Stack>

      {loading && savings.length === 0 && <CardGridSkeleton count={6} />}

      {!loading && visibleSavings.length === 0 && (
        <Paper elevation={0} sx={{ ...glassCard, p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "var(--text-primary)" }}>
            {savings.length === 0 ? "No savings yet" : "No savings match this filter"}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--text-muted)", mt: 0.5 }}>
            {savings.length === 0
              ? "Create your first saving to get started."
              : "Try a different filter or search term."}
          </Typography>
        </Paper>
      )}

      {visibleSavings.length > 0 && (
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
          {visibleSavings.map((row) => (
            <SavingCard
              key={row.nSavingId}
              saving={row}
              onActivate={(s) =>
                handleSetStatus(
                  s,
                  "A",
                  "Activate this saving? It will move from Pending to Active.",
                  "Saving activated!"
                )
              }
              onComplete={(s) =>
                handleSetStatus(
                  s,
                  "C",
                  "Mark this saving as completed?",
                  "Saving completed!"
                )
              }
              onReopen={(s) =>
                handleSetStatus(
                  s,
                  "A",
                  "Reactivate this saving? It moves from Completed back to Active, ready for more deposits.",
                  "Saving reactivated!"
                )
              }
              onEdit={handleOpenEdit}
              onView={(s) => setViewSaving(s)}
              onDelete={() => handleDeleteSaving(row.nSavingId)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </Box>
      )}

      <SavingAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSaving}
        editingSaving={editingSaving}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <SavingEntriesModal
        open={Boolean(viewSaving)}
        saving={viewSaving}
        onClose={() => {
          setViewSaving(null);
          // Deposits change the balance shown on the card behind this modal.
          fetchSavings({ silent: true });
        }}
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
