import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
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
  CreditCard as CardIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import CardAEModal from "./modals/CardAEModal";
import CardTransactionsModal from "./modals/CardTransactionsModal";
import FilterMenu from "../../../components/ui/FilterMenu";
import BankCardFace from "../../../components/ui/BankCardFace";
import { cardColor, isCredit, isFavorite, sortCards } from "../../../lib/cards";
import { CardGridSkeleton } from "../../../components/ui/AppSkeleton";
import { cardService } from "../../../services/cardService";

const glassCard = {
  borderRadius: 3,
  backgroundColor: "var(--glass-bg-strong)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-medium)",
  boxShadow: "var(--glass-shadow)",
};

const CARD_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "D", label: "Debit" },
  { value: "C", label: "Credit" },
];

/** One card — the physical face from the Dashboard (BankCardFace)
 *  with the action buttons in a vertical strip on its RIGHT edge,
 *  painted in the card's own colour so the face reads as extended
 *  into them: favourite star, View (transactions), Edit, Delete. */
function BankCard({ card, onView, onEdit, onDelete, onToggleFavorite }) {
  /* strColor (see src/lib/cards.js) — the strip wears the gradient's
     darkened end colour, so it looks like the card continues into it. */
  const accent = cardColor(card) || "#4a6b8a";
  const favorite = isFavorite(card);

  /* Hover glow shared by the strip's buttons (light icons on the dark
     card colour). */
  const iconSx = (color) => ({
    color,
    borderRadius: 2,
    "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" },
  });

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        borderRadius: "18px",
        overflow: "hidden",
        boxShadow: "var(--glass-shadow)",
      }}
    >
      {/* The card face — the same UI the Dashboard's Cards strip shows.
          Its right corners square off so the strip reads as one piece. */}
      <BankCardFace
        card={card}
        sx={{
          width: "100%",
          flex: 1,
          minWidth: 0,
          boxShadow: "none",
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }}
      />

      {/* The buttons — a vertical strip extending the card. */}
      <Stack
        sx={{
          alignItems: "center",
          justifyContent: "center",
          gap: 0.75,
          px: 0.75,
          background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 40%, #000) 0%, color-mix(in srgb, ${accent} 22%, #0a1628) 100%)`,
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <Tooltip title={favorite ? "Remove from favourites" : "Add to favourites"}>
          <IconButton size="small" onClick={() => onToggleFavorite(card)} sx={{ p: 0.5 }}>
            {favorite ? (
              <StarIcon sx={{ fontSize: 18, color: "#f9a825" }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 18, color: "rgba(255, 255, 255, 0.7)" }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="View transactions">
          <IconButton
            size="small"
            aria-label="View transactions"
            onClick={() => onView(card)}
            sx={iconSx("rgba(255, 255, 255, 0.85)")}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton
            size="small"
            aria-label="Edit"
            onClick={() => onEdit(card)}
            sx={iconSx("rgba(255, 255, 255, 0.85)")}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            aria-label="Delete"
            onClick={() => onDelete(card)}
            sx={iconSx("#ef5350")}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

export default function Cards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("D");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewCard, setViewCard] = useState(null); // opened by View
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  /* options.silent refreshes the cards (balances) without flashing the
     grid's loading state — used when the transactions modal closes. */
  const fetchCards = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await cardService.list();
      setCards(data || []);
    } catch (err) {
      console.error("Error fetching cards:", err);
      showToast(err.message || "Failed to load cards", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  /* Favourites pin above everything; the rest stay newest-first. The
     type filter and search term narrow the list. */
  const visibleCards = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortCards(
      cards
        .filter((c) => typeFilter === "all" || c.cType === typeFilter)
        .filter(
          (c) =>
            !term ||
            (c.strBankName || "").toLowerCase().includes(term) ||
            (c.strAccountNumber || "").toLowerCase().includes(term) ||
            (c.strDescription || "").toLowerCase().includes(term)
        ),
      "nCardId"
    );
  }, [cards, typeFilter, searchTerm]);

  const handleOpenAdd = () => {
    setEditingCard(null);
    setFormData({
      strBankName: "",
      strAccountNumber: "",
      cType: "D",
      dCreditLimit: "",
      nDueDay: "",
      strExpiry: "",
      nCVC: "",
      strDescription: "",
      strColor: "",
      bIsFavorite: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (card) => {
    setEditingCard(card);
    setFormData({
      strBankName: card.strBankName || "",
      strAccountNumber: card.strAccountNumber || "",
      cType: card.cType || "D",
      /* Only a credit card keeps a limit — a debit card shows the
         field cleared (and never sends it back as a number). */
      dCreditLimit: isCredit(card) && card.dCreditLimit != null ? String(card.dCreditLimit) : "",
      /* Billing due day — a credit-only day of the month (1–31). */
      nDueDay: isCredit(card) && card.nDueDay != null ? String(card.nDueDay) : "",
      strExpiry: card.strExpiry || "",
      /* The CVC column is a bigint — keep it a string in the form so
         the dialog's digit-only input behaves. */
      nCVC: card.nCVC != null ? String(card.nCVC) : "",
      strDescription: card.strDescription || "",
      strColor: card.strColor || "",
      bIsFavorite: card.bIsFavorite === true,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingCard(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      /* Switching to debit drops the limit and the billing due day —
         the fields disappear and the server nulls the columns anyway. */
      if (name === "cType" && value === "D") {
        next.dCreditLimit = "";
        next.nDueDay = "";
      }
      return next;
    });
  };

  const handleSaveCard = async () => {
    if (!formData.strBankName?.trim()) {
      showToast("Bank name is required.", "warning");
      return;
    }
    const credit = formData.cType === "C";
    let limit = null;
    if (credit) {
      const parsed = Number(formData.dCreditLimit);
      if (formData.dCreditLimit === "" || !Number.isFinite(parsed)) {
        showToast("Credit limit must be a valid number.", "warning");
        return;
      }
      if (parsed < 0) {
        showToast("Credit limit cannot be negative.", "warning");
        return;
      }
      limit = parsed;
    }
    /* The CVC is optional, but 3–4 digits when present — same rule the
       server enforces (the column is a bigint). */
    const cvc = formData.nCVC?.trim() || "";
    if (cvc && !/^\d{3,4}$/.test(cvc)) {
      showToast("CVC must be 3 or 4 digits.", "warning");
      return;
    }
    /* The billing due day is optional, but a whole 1–31 when present —
       same rule the server enforces (the column is an integer). */
    const dueDayRaw = formData.nDueDay?.trim() || "";
    let dueDay = null;
    if (credit && dueDayRaw !== "") {
      const parsed = Number(dueDayRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
        showToast("Due day must be a whole number from 1 to 31.", "warning");
        return;
      }
      dueDay = parsed;
    }

    const payload = {
      strBankName: formData.strBankName.trim(),
      strAccountNumber: formData.strAccountNumber?.trim() || null,
      cType: credit ? "C" : "D",
      /* The limit travels with the type: a number for credit, null for
         debit (the server enforces the same rule). */
      dCreditLimit: credit ? limit : null,
      /* Billing due day — credit only, a whole day from 1 to 31. */
      nDueDay: dueDay,
      strExpiry: formData.strExpiry?.trim() || null,
      /* Sent as a digit string — the server checks 3–4 digits and
         stores the number (the column is a bigint). */
      nCVC: formData.nCVC?.trim() || null,
      strDescription: formData.strDescription?.trim() || null,
      /* Cosmetic columns (see src/lib/cards.js) — the server keeps a
         colour code and a real boolean, or null when cleared. */
      strColor: formData.strColor?.trim() || null,
      bIsFavorite: formData.bIsFavorite === true,
    };

    setSaving(true);
    try {
      if (editingCard) {
        await cardService.update(editingCard.nCardId, payload);
        showToast("Card updated successfully!");
      } else {
        await cardService.create(payload);
        showToast("Card created — ready to use.");
      }

      handleCloseModal();
      await fetchCards();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save card", "error");
    } finally {
      setSaving(false);
    }
  };

  /* Star toggle — one cosmetic column, written straight back. */
  const handleToggleFavorite = async (card) => {
    try {
      await cardService.update(card.nCardId, {
        bIsFavorite: card.bIsFavorite !== true,
      });
      await fetchCards({ silent: true });
    } catch (err) {
      console.error("Favourite error:", err);
      showToast(err.message || "Failed to update favourite", "error");
    }
  };

  const handleDeleteCard = async (card) => {
    const question =
      "Are you sure you want to delete this card? Its transactions will be deleted too.";
    if (!window.confirm(question)) return;

    try {
      await cardService.remove(card.nCardId);
      showToast("Card deleted successfully!");
      await fetchCards();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete card", "error");
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
          <CardIcon sx={{ color: "var(--accent)", fontSize: 18 }} />
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
            Cards
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Search cards..."
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
            value={typeFilter}
            onChange={setTypeFilter}
            options={CARD_FILTER_OPTIONS}
            counts={{
              all: cards.length,
              D: cards.filter((c) => c.cType === "D").length,
              C: cards.filter((c) => c.cType === "C").length,
            }}
            label="Filter cards by type"
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
              New Card
            </Box>
          </Button>
        </Stack>
      </Stack>

      {loading && cards.length === 0 && <CardGridSkeleton count={6} />}

      {!loading && visibleCards.length === 0 && (
        <Paper elevation={0} sx={{ ...glassCard, p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "var(--text-primary)" }}>
            {cards.length === 0 ? "No cards yet" : "No cards match this filter"}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--text-muted)", mt: 0.5 }}>
            {cards.length === 0
              ? "Add your first debit or credit card to start charging transactions to it."
              : "Try a different filter or search term."}
          </Typography>
        </Paper>
      )}

      {visibleCards.length > 0 && (
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
          {visibleCards.map((card) => (
            <BankCard
              key={card.nCardId}
              card={card}
              onView={(c) => setViewCard(c)}
              onEdit={handleOpenEdit}
              onDelete={handleDeleteCard}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </Box>
      )}

      <CardAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveCard}
        editingCard={editingCard}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <CardTransactionsModal
        open={Boolean(viewCard)}
        card={viewCard}
        onClose={() => {
          setViewCard(null);
          // Transactions change the balance shown on the card behind this modal.
          fetchCards({ silent: true });
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
