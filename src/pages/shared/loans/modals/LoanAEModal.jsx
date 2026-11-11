import React from "react";
import { Typography } from "@mui/material";
import ModalComponent from "../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../components/ui/FieldsComponent";
import { colorOptions } from "../../../../lib/cards";

/* The schedule fields — hidden entirely while the loan is Active: an
   Active loan owns entries already, so only its presentation (title,
   colour, description, favourite) may change until it is cancelled. */
const SCHEDULE_FIELDS = [
  {
    name: "dAmount",
    label: "Loan Amount",
    type: "peso",
    required: true,
    gridCols: 4,
    placeholder: "0.00",
  },
  {
    name: "nTerms",
    label: "Number of Terms",
    type: "number",
    required: true,
    gridCols: 4,
    placeholder: "e.g. 12",
  },
  {
    name: "dttDueDate",
    label: "Due Date",
    type: "date",
    required: true,
    gridCols: 4,
  },
  {
    name: "cInterestType",
    label: "Interest Period",
    type: "select",
    required: true,
    gridCols: 6,
    options: [
      { label: "Daily", value: "D" },
      { label: "Weekly", value: "W" },
      { label: "Monthly", value: "M" },
      { label: "Annual", value: "A" },
    ],
  },
  {
    name: "dInterest",
    label: "Interest Rate (%)",
    type: "number",
    required: true,
    gridCols: 6,
    placeholder: "0.00",
  },
];

const getFormFields = ({ active = false, storedColor = "" } = {}) => [
  {
    name: "strTitle",
    label: "Title",
    required: true,
    gridCols: 12,
    placeholder: "e.g. Motorcycle loan",
  },
  /* Amount / terms / due date / interest only exist while the loan can
     still be shaped — see SCHEDULE_FIELDS. */
  ...(active ? [] : SCHEDULE_FIELDS),
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
    placeholder: "Optional notes about this loan",
  },
];

/**
 * Add/Edit dialog for a loan.
 * `strCode` (LON-0001, ...), `cStatus` (always starts "P") and `nUserId` are
 * server-owned — never sent back. `dttDueDate` IS user-owned: the first
 * payment date, shown on the card as the range first – last.
 * `strColor` (a colour code: G = Green, R = Red, ...) and `bIsFavorite`
 * (pinned to the top of the grid) are cosmetic — see src/lib/cards.js.
 *
 * An ACTIVE loan opens this dialog with the schedule fields removed —
 * amount / terms / date / interest are locked while entries exist, and
 * the server refuses them too (see updateLoan).
 */
export default function LoanAEModal({
  open,
  onClose,
  onSave,
  editingLoan,
  formData,
  onChange,
  saving,
}) {
  const active = editingLoan?.cStatus === "A";
  const title = editingLoan
    ? `Edit ${editingLoan.strCode || `Loan #${editingLoan.nLoanId}`}`
    : "New Loan";

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={title}
      type={editingLoan ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingLoan ? "Save changes" : "Create loan"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields({ active, storedColor: formData.strColor })}
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
        {active ? (
          <>
            This loan is <strong>Active</strong>, so its amount, terms, dates and
            interest are <strong>locked</strong> — only the title, colour,
            description and favourite flag can change here. Use{" "}
            <strong>Cancel</strong> on the card first if you need to rework the
            schedule.
          </>
        ) : (
          <>
            The due date is the <strong>first payment</strong> date — the card
            shows the full schedule (first – last across the terms). New loans
            start as <strong>Pending</strong> until activated.
          </>
        )}
      </Typography>
    </ModalComponent>
  );
}
