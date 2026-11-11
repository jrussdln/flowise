import React from "react";
import { Typography } from "@mui/material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";
import { colorOptions } from "../../../../../lib/cards";

const getFormFields = ({ storedColor = "" } = {}) => [
  {
    name: "strTitle",
    label: "Title",
    required: true,
    gridCols: 12,
    placeholder: "e.g. Monthly groceries",
  },
  {
    name: "dBudgetAmount",
    label: "Budget amount",
    type: "peso",
    gridCols: 12,
    placeholder: "0.00",
    helperText: "Optional — what this plan is budgeted for",
  },
  {
    name: "strColor",
    label: "Card colour",
    type: "color",
    gridCols: 6,
    options: colorOptions(storedColor),
    helperText: "Accent colour on the card",
  },
  {
    name: "strDescription",
    label: "Description",
    multiline: true,
    rows: 3,
    gridCols: 6,
    placeholder: "Optional notes about this budget plan",
  },
];

/**
 * Add/Edit dialog for a budget plan.
 * `strCode` (BUD-0001, ...), `cStatus` (always starts "P") and `nUserId`
 * are server-owned — never sent back. Status moves through the card's
 * Activate / Complete buttons instead of this form. `dBudgetAmount` is
 * the plan's own figure (optional — clear the field to drop it).
 * `strColor` (a colour code: G = Green, R = Red, ...) and `bIsFavorite`
 * (pinned to the top of the grid) are cosmetic — see src/lib/cards.js.
 */
export default function BudgetPlanAEModal({
  open,
  onClose,
  onSave,
  editingPlan,
  formData,
  onChange,
  saving,
}) {
  const title = editingPlan
    ? `Edit ${editingPlan.strCode || `Plan #${editingPlan.nBudgetPlanId}`}`
    : "New Budget Plan";

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={title}
      type={editingPlan ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingPlan ? "Save changes" : "Create budget plan"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields({ storedColor: formData.strColor })}
        values={formData}
        onChange={onChange}
        switches={[
          { name: "bIsFavorite", label: "Favourite — pin this card to the top of the grid" },
        ]}
      />
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 2, color: "var(--text-muted)" }}
      >
        New budget plans start as <strong>Pending</strong> — use <strong>Activate</strong> on
        the card to move them to Active, and <strong>Deactivate</strong> to send one back to
        Pending. A plan is a named plan only: it holds no amount and never adds a transaction.
      </Typography>
    </ModalComponent>
  );
}
