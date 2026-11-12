import React, { useEffect } from "react";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";

/* Display names per movement type (Inflow / Outflow / Credit /
   Payment / Transfer). */
const LEDGER_TYPE_META = {
  IN: "Inflow",
  OUT: "Outflow",
  PRC: "Credit",
  PAY: "Payment",
  TRF: "Transfer",
};



/* Fields adapt to the movement type: a transfer swaps the category for
   a destination account. When ADDING, the Type field is omitted — the
   header's icon buttons preset the type, so it has no select to change.
   `fromAccountId` excludes the chosen From account from the To menu. */
const getFormFields = (
  isEdit,
  cType,
  accounts = [],
  categories = [],
  lookupsLoading = false,
  fromAccountId = null
) => {
  /* Label shows the name plus its Bank/Provider and masked last 4,
     e.g. "Gcash ••••0603" or "BPI Savings - BPI ••••1234". */
  /* Balance display: "(₱1,234.00)" — null/unknown shows nothing. */
  const pesoBalance = (value) =>
    value === null || value === undefined || Number.isNaN(Number(value))
      ? null
      : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const accountOptions = accounts.map((a) => {
    const balance = pesoBalance(a.dBalance);
    return {
      label: `${a.strName}${a.strInstitution ? ` - ${a.strInstitution}` : ""}${
        a.strLast4 ? ` ••••${a.strLast4}` : ""
      }${balance ? ` (${balance})` : ""}`,
      value: a.nAccountId,
    };
  });
  /* The source account can't also be the destination. */
  const toAccountOptions = accountOptions.filter((o) => o.value !== Number(fromAccountId));
  /* Purchases must charge a credit card account. */
  const creditCardOptions = accountOptions.filter(
    (o) => accounts.find((a) => a.nAccountId === o.value)?.cAccountType === "CREDIT"
  );

  const base = [
    /* Title, Amount and Fee share one row (3 x 4/12). */
    { name: "strTitle", label: "Title", required: true, gridCols: 4 },
    { name: "dAmount", label: "Amount", type: "peso", required: true, gridCols: 4 },
    { name: "dFee", label: "Fee", type: "peso", gridCols: 4 },
    /* Type select only in Edit mode — on Add it's preset by the
       header button that opened the modal. Hidden on Loan entries:
       the type is fixed (Loan) and they have no account. */
    ...(isEdit && cType !== "LN"
      ? [
          {
            name: "cType",
            label: "Type",
            type: "select",
            required: true,
            /* Transfers: full row (From pairs with To instead).
               Others: half row, paired with the Account. */
            gridCols: cType === "TRF" ? 12 : 6,
            options: [
              { label: LEDGER_TYPE_META.IN, value: "IN" },
              { label: LEDGER_TYPE_META.OUT, value: "OUT" },
              { label: LEDGER_TYPE_META.PRC, value: "PRC" },
              { label: LEDGER_TYPE_META.PAY, value: "PAY" },
              { label: LEDGER_TYPE_META.TRF, value: "TRF" },
            ],
          },
        ]
      : []),
    /* Loan entries have no account (they're loan-level), so the
       Account field is hidden for them. */
    ...(cType === "LN"
      ? []
      : [
          {
            name: "nAccountId",
            label: cType === "TRF" ? "From Account" : "Account",
            type: "select",
            required: true,
            /* Transfers: half row, paired with To Account.
               Others: Add ⅓ row (Account | Category | Merchant), Edit half row with Type. */
            gridCols: cType === "TRF" || isEdit ? 6 : 4,
            /* Purchases charge a credit card — only CREDIT accounts qualify. */
            options: cType === "PRC" ? creditCardOptions : accountOptions,
            /* Real loading flag only — an empty list shows the empty state,
               never an endless skeleton. */
            loading: lookupsLoading,
            emptyText:
              cType === "PRC"
                ? "No credit cards yet — create one on the Accounts page."
                : "No accounts yet — create one on the Accounts page.",
          },
        ]),
  ];

  const conditional =
    cType === "TRF"
      ? [
          {
            name: "nToAccountId",
            label: "To Account",
            type: "select",
            required: true,
            /* Half row, paired with the From Account (both modes). */
            gridCols: 6,
            /* The From account is excluded — a transfer needs a
               different destination. */
            options: toAccountOptions,
            loading: lookupsLoading,
            emptyText: "No accounts yet — create one on the Accounts page.",
          },
        ]
      : [
          {
            name: "nCategoryId",
            label: "Category",
            type: "select",
            /* Add: ⅓ row (Account | Category | Merchant).
               Edit: half row, paired with the Merchant. */
            gridCols: isEdit ? 6 : 4,
            /* Just the name — the modal already has its own Type field. */
            options: categories.map((c) => ({
              label: c.strName,
              value: c.nCategoryId,
            })),
            loading: lookupsLoading,
            emptyText: "No categories yet.",
          },
        ];

  return [
    ...base,
    ...conditional,
    /* Add: ⅓ row (Account | Category | Merchant).
       Edit (non-transfer): half row, paired with the Category.
       Transfer: ⅓ row (Merchant | Reference | Date). */
    { name: "strMerchant", label: "Merchant", gridCols: cType === "TRF" || !isEdit ? 4 : 6 },
    /* Non-transfer: half row paired with the Date. Transfer: ⅓ row. */
    { name: "strReference", label: "Reference No.", gridCols: cType === "TRF" ? 4 : 6 },
    { name: "dTransactionDate", label: "Transaction Date", type: "date", required: true, gridCols: cType === "TRF" ? 4 : 6 },
    { name: "strNotes", label: "Notes", multiline: true, minRows: 2, gridCols: 12 },
  ];
};

export default function LedgerAEModal({
  open,
  onClose,
  onSave,
  editingEntry,
  formData,
  onChange,
  saving,
  accounts = [],
  categories = [],
  lookupsLoading = false,
}) {
  const isEdit = Boolean(editingEntry);
  const typeLabel = LEDGER_TYPE_META[formData.cType] || "Entry";

  /* If the From account becomes the currently selected To account
     (e.g. user changes From after picking To), clear the stale pick. */
  useEffect(() => {
    if (
      open &&
      formData.cType === "TRF" &&
      formData.nToAccountId &&
      Number(formData.nToAccountId) === Number(formData.nAccountId)
    ) {
      onChange("nToAccountId", "");
    }
  }, [open, formData.cType, formData.nAccountId, formData.nToAccountId, onChange]);

  /* Transfers: pre-fill Merchant with the From account's Bank/Provider
     (e.g. "BPI") — only when the field is empty, so a manual edit stays. */
  useEffect(() => {
    if (!open || formData.cType !== "TRF" || !formData.nAccountId || formData.strMerchant) return;
    const from = accounts.find((a) => a.nAccountId === Number(formData.nAccountId));
    if (from?.strInstitution) onChange("strMerchant", from.strInstitution);
  }, [open, formData.cType, formData.nAccountId, formData.strMerchant, accounts, onChange]);

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Entry" : `Add ${typeLabel}`}
      subtitle={
        isEdit
          ? formData.strTitle || `Entry #${editingEntry.nLedgerId}`
          : "Record an inflow, outflow, or transfer between accounts."
      }
      type={isEdit ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : isEdit ? "Save changes" : `Add ${typeLabel.toLowerCase()}`}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields(
          isEdit,
          formData.cType,
          accounts,
          categories,
          lookupsLoading,
          formData.nAccountId
        )}
        values={formData}
        onChange={onChange}
      />
    </ModalComponent>
  );
}
