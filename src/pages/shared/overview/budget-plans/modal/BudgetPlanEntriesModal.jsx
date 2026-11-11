import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ReceiptLong as EntriesIcon,
} from "@mui/icons-material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import { RowsSkeleton } from "../../../../../components/ui/AppSkeleton";
import { budgetPlanService } from "../../../../../services/budgetPlanService";

/* ₱ amounts — keep in sync with BudgetPlans.jsx. */
const money = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0
  );

/** A figure tile in the summary panel — label on top, amount below. */
function SummaryTile({ label, value, tone = "default", hint }) {
  const tones = {
    default: { color: "var(--text-primary)", bg: "transparent" },
    accent: { color: "var(--accent)", bg: "transparent" },
    positive: { color: "#2e7d32", bg: "transparent" },
    negative: { color: "#f44336", bg: "transparent" },
  };
  const toneSx = tones[tone] ?? tones.default;

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        border: "1px solid var(--border-medium)",
        backgroundColor: "var(--overlay-dark)",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: "block",
          fontWeight: 700,
          fontSize: "0.66rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          display: "block",
          mt: 0.25,
          fontSize: "1.05rem",
          fontWeight: 700,
          lineHeight: 1.25,
          color: toneSx.color,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </Typography>
      {hint && (
        <Typography
          variant="caption"
          sx={{ display: "block", color: "var(--text-muted)", fontSize: "0.68rem" }}
        >
          {hint}
        </Typography>
      )}
    </Box>
  );
}

/**
 * A budget plan's entries (tblentries, cType "B") — the line items that
 * make up the plan: a title and an amount each.
 *
 * The summary panel at the top of the dialog reads the plan against its
 * budget: the budgeted amount, what the line items add up to
 * (`dTotal`) and the **remaining balance** between them, with a bar
 * showing how much of the budget is spoken for. A plan without a
 * `dBudgetAmount` has no remaining balance to show — the panel falls
 * back to the planned total and the entry count.
 *
 * The footer carries one action, **Add**, which swaps the dialog's
 * content for a two-field form (Title + Amount). Saving POSTs
 * /api/entries { cType: "B", nReferenceId, strTitle, dAmount }; the
 * server writes the row with cStatus "P" and its nTransactionId left
 * null — a plan is a plan, so it never adds a transaction.
 *
 * Every row also has an **Edit** button, which opens the same two-field
 * form prefilled with that row (PUT /api/entries/:id — title and/or
 * amount; the entry's status and its (empty) transaction link are never
 * touched).
 *
 * Deleting a row DELETEs /api/entries/:id, which removes just that
 * line item.
 */
export default function BudgetPlanEntriesModal({ open, onClose, plan }) {
  const planId = plan?.nBudgetPlanId;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0); // bump to refetch after add/edit/delete
  /* null = the entry list, "add" = the Title + Amount form for a new
     entry, "edit" = the same form for the entry being edited. */
  const [mode, setMode] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });

  useEffect(() => {
    if (!open || !planId) return undefined;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await budgetPlanService.listEntries(planId);
        if (!alive) return;
        setEntries(data || []);
      } catch (err) {
        console.error("Error fetching budget plan entries:", err);
        if (!alive) return;
        setEntries([]);
        setError(err?.message || "Failed to load entries");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, planId, version]);

  /* Leaving the dialog always comes back to the list, never the form. */
  const handleClose = () => {
    if (submitting) return;
    setMode(null);
    setEditingEntry(null);
    setTitle("");
    setAmount("");
    onClose();
  };

  const startAdd = () => {
    setEditingEntry(null);
    setTitle("");
    setAmount("");
    setMode("add");
  };

  const startEdit = (entry) => {
    setEditingEntry(entry);
    setTitle(entry.strTitle || "");
    setAmount(entry.dAmount == null ? "" : String(entry.dAmount));
    setMode("edit");
  };

  const cancelForm = () => {
    if (submitting) return;
    setMode(null);
    setEditingEntry(null);
    setTitle("");
    setAmount("");
  };

  const handleSave = async () => {
    const value = Number(amount);
    if (!title.trim()) {
      setSnack({ open: true, message: "Title is required.", severity: "warning" });
      return;
    }
    if (amount.trim() === "" || !Number.isFinite(value)) {
      setSnack({ open: true, message: "Amount must be a valid number.", severity: "warning" });
      return;
    }
    if (value <= 0) {
      setSnack({ open: true, message: "Amount must be greater than zero.", severity: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "edit" && editingEntry) {
        await budgetPlanService.updateEntry(editingEntry.nEntriesId, {
          strTitle: title.trim(),
          dAmount: value,
        });
        setSnack({ open: true, message: "Entry updated.", severity: "success" });
      } else {
        await budgetPlanService.addEntry(planId, { strTitle: title.trim(), dAmount: value });
        setSnack({ open: true, message: "Entry added.", severity: "success" });
      }

      setMode(null);
      setEditingEntry(null);
      setTitle("");
      setAmount("");
      setVersion((v) => v + 1); // refetch the entry list
    } catch (err) {
      console.error("Save entry error:", err);
      setSnack({ open: true, message: err.message || "Failed to save entry", severity: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm("Delete this entry?")) return;

    setDeletingId(entry.nEntriesId);
    try {
      await budgetPlanService.removeEntry(entry.nEntriesId);
      setSnack({ open: true, message: "Entry deleted.", severity: "success" });
      setVersion((v) => v + 1); // refetch the entry list
    } catch (err) {
      console.error("Delete entry error:", err);
      setSnack({ open: true, message: err.message || "Failed to delete entry", severity: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  /* The plan against its budget: what it is budgeted for, what the line
     items add up to, and what is left of the budget. */
  const summary = useMemo(() => {
    const total = entries.reduce((sum, e) => sum + (Number(e.dAmount) || 0), 0);
    const budget =
      plan?.dBudgetAmount === null || plan?.dBudgetAmount === undefined
        ? null
        : Number(plan.dBudgetAmount) || 0;
    const remaining = budget === null ? null : budget - total;
    const percent = budget && budget > 0 ? Math.min(100, (total / budget) * 100) : total > 0 ? 100 : 0;

    return {
      total,
      budget,
      remaining,
      percent,
      over: remaining !== null && remaining < 0,
    };
  }, [entries, plan]);

  const { total, budget, remaining, percent, over } = summary;
  const isEditing = mode === "edit";
  /* A used plan ("C") posted its entries to the ledger as expenses —
     they are locked until the plan is activated again. */
  const isUsed = plan?.cStatus === "C";

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      color: "var(--text-primary)",
      backgroundColor: "var(--bg-primary)",
      "& fieldset": { borderColor: "var(--border-medium)" },
      "&:hover fieldset": { borderColor: "var(--accent)" },
      "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
    },
    "& .MuiInputLabel-root": { color: "var(--text-muted)" },
  };

  return (
    <ModalComponent
      open={open}
      onClose={handleClose}
      title={plan ? `Entries — ${plan.strCode || `Plan #${plan.nBudgetPlanId}`}` : "Entries"}
      type="view"
      maxWidth="sm"
      onSave={mode ? handleSave : undefined}
      saveLabel={submitting ? "Saving…" : isEditing ? "Save changes" : "Save entry"}
      saving={Boolean(mode) && submitting}
      onCancel={mode ? cancelForm : undefined}
      actions={
        mode || isUsed ? undefined : (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={startAdd}
            disabled={loading}
            sx={{
              color: "var(--accent)",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8rem",
              px: 1,
              whiteSpace: "nowrap",
              "&:hover": { backgroundColor: "rgba(0, 131, 143, 0.12)" },
            }}
          >
            Add
          </Button>
        )
      }
    >
      {/* ---- Summary: the plan against its budget ---- */}
      {!mode && plan && !loading && !error && (
        <Box
          sx={{
            mb: 2,
            p: 1.75,
            borderRadius: 2.5,
            border: "1px solid var(--border-medium)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1.5 }}>
            <EntriesIcon sx={{ color: "var(--accent)", fontSize: 16 }} />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: "0.68rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              {plan.strTitle || "Untitled budget plan"}
            </Typography>
            {isUsed && (
              <Chip
                size="small"
                label="Used"
                sx={{
                  bgcolor: "rgba(21, 101, 192, 0.14)",
                  color: "#1565c0",
                  fontWeight: 700,
                  fontSize: "0.66rem",
                  height: 20,
                }}
              />
            )}
          </Stack>

          {/* A used plan's entries live in the ledger now — they are
              read-only until the plan is activated again. */}
          {isUsed && (
            <Box
              sx={{
                mb: 1.75,
                px: 1.25,
                py: 1,
                borderRadius: 2,
                border: "1px solid rgba(21, 101, 192, 0.35)",
                backgroundColor: "rgba(21, 101, 192, 0.08)",
              }}
            >
              <Typography variant="caption" sx={{ color: "var(--text-secondary)" }}>
                These entries were posted to <strong>Transactions</strong> as expenses when the
                plan was used. They are locked — activate the plan to bring them back and edit
                them again.
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={1}>
            {budget !== null ? (
              <>
                <SummaryTile label="Budget" value={money(budget)} tone="default" />
                <SummaryTile
                  label="Planned"
                  value={money(total)}
                  tone="accent"
                  hint={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
                />
                <SummaryTile
                  label="Remaining"
                  value={money(remaining)}
                  tone={over ? "negative" : "positive"}
                  hint={over ? "Over budget" : "Still available"}
                />
              </>
            ) : (
              <>
                <SummaryTile
                  label="Planned Total"
                  value={money(total)}
                  tone="accent"
                  hint={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
                />
                <SummaryTile
                  label="Budget"
                  value="Not set"
                  tone="default"
                  hint="Set one on the plan"
                />
              </>
            )}
          </Stack>

          {/* How much of the budget the line items use up. */}
          {budget !== null && (
            <Box sx={{ mt: 1.75 }}>
              <LinearProgress
                variant="determinate"
                value={percent}
                sx={{
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: "var(--overlay-dark)",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 999,
                    backgroundColor: over ? "#f44336" : "var(--accent)",
                  },
                }}
              />
              <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.75 }}>
                <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                  {Math.round(percent)}% of the budget allocated
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: over ? "#f44336" : "var(--text-muted)", fontWeight: 600 }}
                >
                  {over ? `${money(Math.abs(remaining))} over` : `${money(remaining)} left`}
                </Typography>
              </Stack>
            </Box>
          )}
        </Box>
      )}

      {/* ---- Add / Edit form: shown in the modal content when Add or a
               row's Edit button is pressed ---- */}
      {mode && (
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="e.g. Groceries"
            sx={fieldSx}
          />
          <TextField
            fullWidth
            size="small"
            label="Amount"
            type="number"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="0.00"
            slotProps={{
              htmlInput: { min: 0, step: "0.01" },
              input: {
                startAdornment: (
                  <Typography variant="body2" sx={{ color: "var(--text-muted)", mr: 0.5 }}>
                    ₱
                  </Typography>
                ),
              },
            }}
            sx={fieldSx}
          />

          <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)" }}>
            {isEditing ? (
              <>
                Changes the <strong>title</strong> and <strong>amount</strong> of this entry.
              </>
            ) : (
              <>
                Adds a <strong>line item</strong> to this budget plan — a title and an amount.
                Plan entries stay on the plan: they never add a transaction.
              </>
            )}
          </Typography>
        </Stack>
      )}

      {/* ---- Entry list ---- */}
      {/* Loading: skeleton rows shaped like the entry list, not a
          spinner (the delete button keeps its own spinner). */}
      {!mode && loading && (
        <Stack sx={{ py: 1.5 }}>
          <RowsSkeleton rows={4} />
        </Stack>
      )}

      {!mode && !loading && error && (
        <Typography variant="body2" sx={{ color: "#f44336", py: 2, textAlign: "center" }}>
          {error}
        </Typography>
      )}

      {!mode && !loading && !error && entries.length === 0 && (
        <Box
          sx={{
            py: 3.5,
            px: 2,
            textAlign: "center",
            borderRadius: 2.5,
            border: "1px dashed var(--border-medium)",
          }}
        >
          <EntriesIcon sx={{ color: "var(--text-muted)", fontSize: 28, mb: 1 }} />
          <Typography variant="body2" sx={{ color: "var(--text-primary)", fontWeight: 600 }}>
            No entries yet
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", display: "block", mt: 0.5 }}>
            Press <strong>Add</strong> to break this plan into line items.
          </Typography>
        </Box>
      )}

      {!mode && !loading && !error && entries.length > 0 && (
        <Stack spacing={1}>
          {entries.map((entry, index) => (
            <Stack
              key={entry.nEntriesId}
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
                px: 1.5,
                py: 1.1,
                borderRadius: 2,
                border: "1px solid var(--border-light)",
                backgroundColor: "var(--overlay-dark)",
                transition: "border-color .15s ease, background-color .15s ease",
                "&:hover": {
                  borderColor: "var(--border-medium)",
                  backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
                },
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-medium)",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 700 }}
                >
                  {index + 1}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: "var(--text-primary)",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.strTitle || "Untitled entry"}
                </Typography>
              </Box>

              <Typography
                variant="body2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {money(entry.dAmount)}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
                {isUsed ? (
                  /* A used plan's entries are expenses in the ledger —
                     they can no longer be edited or deleted here. */
                  <Chip
                    size="small"
                    label="Posted"
                    sx={{
                      bgcolor: "rgba(21, 101, 192, 0.14)",
                      color: "#1565c0",
                      fontWeight: 600,
                      fontSize: "0.68rem",
                      height: 22,
                    }}
                  />
                ) : (
                  <>
                    <Tooltip title="Edit entry">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Edit entry"
                          onClick={() => startEdit(entry)}
                          sx={{ p: 0.5 }}
                        >
                          <EditIcon fontSize="small" sx={{ color: "var(--accent)", fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete entry">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="Delete entry"
                          disabled={deletingId === entry.nEntriesId}
                          onClick={() => handleDelete(entry)}
                          sx={{ p: 0.5 }}
                        >
                          {deletingId === entry.nEntriesId ? (
                            <CircularProgress size={16} />
                          ) : (
                            <DeleteIcon fontSize="small" sx={{ color: "#f44336", fontSize: 18 }} />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                )}
              </Box>
            </Stack>
          ))}

          <Stack
            direction="row"
            sx={{
              px: 1.5,
              pt: 1.25,
              justifyContent: "space-between",
              alignItems: "baseline",
              borderTop: "1px solid var(--border-medium)",
              mt: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: "0.68rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Total planned
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}
            >
              {money(total)}
            </Typography>
          </Stack>
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </ModalComponent>
  );
}
