import React from "react";
import { Typography } from "@mui/material";
import ModalComponent from "../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../components/ui/FieldsComponent";
import { CARD_TYPES, colorOptions } from "../../../../lib/cards";

/**
 * Field list for the card dialog. The credit limit only exists on a
 * credit card, so the field appears only when the chosen type is "C" —
 * a debit card never shows it (and the server stores null for it).
 */
const getFormFields = ({ isCredit, storedColor = "" }) => [
  {
    name: "strBankName",
    label: "Bank name",
    required: true,
    gridCols: 6,
    placeholder: "e.g. BDO",
  },
  {
    name: "strAccountNumber",
    label: "Account number",
    type: "bank",
    gridCols: 6,
    helperText: "Only the last 4 digits are ever shown",
  },
  {
    name: "cType",
    label: "Card type",
    type: "select",
    required: true,
    gridCols: 6,
    options: CARD_TYPES,
    helperText: "Debit spends its balance; credit has a limit",
  },
  ...(isCredit
    ? [
        {
          name: "dCreditLimit",
          label: "Credit limit",
          type: "peso",
          required: true,
          gridCols: 6,
          placeholder: "0.00",
        },
        {
          name: "nDueDay",
          label: "Billing due day",
          type: "text",
          numberOnly: true,
          gridCols: 6,
          placeholder: "1 - 31",
          helperText: "Day of the month the bill falls due",
        },
      ]
    : []),
  {
    name: "strExpiry",
    label: "Expiry",
    gridCols: 6,
    placeholder: "MM/YY",
    helperText: "As printed on the card",
  },
  {
    name: "nCVC",
    label: "CVC",
    type: "text",
    numberOnly: true,
    gridCols: 6,
    placeholder: "123",
    helperText: "3 or 4 digits",
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
    placeholder: "Optional notes about this card",
  },
];

/**
 * Add/Edit dialog for a debit or credit card.
 * `cStatus` (always "A") and `nUserId` are server-owned — never sent
 * back. `dCreditLimit` and the billing due day (`nDueDay`, 1–31) are
 * shown only for credit cards, and stored as null for debit.
 * `strColor` (a colour code: G = Green, R = Red, ...) and
 * `bIsFavorite` (pinned to the top of the grid) are cosmetic — see
 * src/lib/cards.js.
 */
export default function CardAEModal({
  open,
  onClose,
  onSave,
  editingCard,
  formData,
  onChange,
  saving,
}) {
  const isCredit = formData.cType === "C";
  const title = editingCard
    ? `Edit ${editingCard.strBankName || `Card #${editingCard.nCardId}`}`
    : "New Card";

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={title}
      type={editingCard ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingCard ? "Save changes" : "Create card"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields({ isCredit, storedColor: formData.strColor })}
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
        {isCredit ? (
          <>
            A <strong>credit</strong> card's balance is what you owe: charges raise it,
            payments (income transactions on this card) lower it. The limit is shown on
            the card.
          </>
        ) : (
          <>
            A <strong>debit</strong> card's balance is the income recorded on it minus its
            expenses — pick <strong>Credit</strong> above if the card has a spending limit
            instead.
          </>
        )}
      </Typography>
    </ModalComponent>
  );
}
