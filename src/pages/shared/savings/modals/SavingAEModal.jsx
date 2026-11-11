import React from "react";
import { Typography } from "@mui/material";
import ModalComponent from "../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../components/ui/FieldsComponent";
import { colorOptions } from "../../../../lib/cards";

const getFormFields = ({ storedColor = "" } = {}) => [
  {
    name: "strTitle",
    label: "Title",
    required: true,
    gridCols: 12,
    placeholder: "e.g. Emergency fund",
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
    placeholder: "Optional notes about this saving",
  },
];

/**
 * Add/Edit dialog for a saving.
 * `strCode` (SAV-0001, ...), `cStatus` (always starts "P") and `nUserId`
 * are server-owned — never sent back. Status moves through the card's
 * Activate / Complete buttons instead of this form. `strColor` (a colour
 * code: G = Green, R = Red, ...) and `bIsFavorite` (pinned to the top of
 * the grid) are cosmetic — see src/lib/cards.js.
 */
export default function SavingAEModal({
  open,
  onClose,
  onSave,
  editingSaving,
  formData,
  onChange,
  saving,
}) {
  const title = editingSaving
    ? `Edit ${editingSaving.strCode || `Saving #${editingSaving.nSavingId}`}`
    : "New Saving";

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={title}
      type={editingSaving ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingSaving ? "Save changes" : "Create saving"}
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
        New savings start as <strong>Pending</strong> — use <strong>Activate</strong> on
        the card to move them to Active, and <strong>Complete</strong> when the goal is
        reached.
      </Typography>
    </ModalComponent>
  );
}
