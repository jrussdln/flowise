import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";

/* Fields depend on the selected account type: the credit-card-only
   fields appear just for CREDIT. */
const getFormFields = (cAccountType) => {
  const base = [
    { name: "strName", label: "Account Name", required: true, gridCols: 6 },
    {
      name: "cAccountType",
      label: "Account Type",
      type: "select",
      required: true,
      gridCols: 6,
      options: [
        { label: "Cash", value: "CASH" },
        { label: "Bank", value: "BANK" },
        { label: "Debit Card", value: "DEBIT" },
        { label: "Credit Card", value: "CREDIT" },
        { label: "E-Wallet", value: "EWALLET" },
      ],
    },
    { name: "strInstitution", label: "Bank / Provider", gridCols: 6 },
    { name: "strLast4", label: "Last 4 Digits", type: "number", gridCols: 6 },
    {
      name: "dOpeningBalance",
      label: "Opening Balance",
      type: "peso",
      required: true,
      gridCols: 6,
    },
    { name: "strCurrency", label: "Currency", gridCols: 6, helperText: "3-letter code (PHP)" },
  ];

  const credit =
    cAccountType === "CREDIT"
      ? [
          { name: "dCreditLimit", label: "Credit Limit", type: "peso", gridCols: 4 },
          { name: "nStatementDay", label: "Statement Day (1–31)", type: "number", gridCols: 4 },
          { name: "nDueDay", label: "Due Day (1–31)", type: "number", gridCols: 4 },
        ]
      : [];

  /* Status is managed from the table's status button, not the form. */
  return [...base, ...credit];
};

export default function AccountsAEModal({
  open,
  onClose,
  onSave,
  editingAccount,
  formData,
  onChange,
  saving,
}) {
  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={editingAccount ? "Edit Account" : "Add Account"}
      subtitle={
        editingAccount
          ? formData.strName || `Account #${editingAccount.nAccountId}`
          : "Track cash, cards and e-wallets in one place."
      }
      type={editingAccount ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingAccount ? "Save changes" : "Create account"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields(formData.cAccountType)}
        values={formData}
        onChange={onChange}
      />
    </ModalComponent>
  );
}
