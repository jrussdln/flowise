import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";

const getFormFields = () => [
  { name: "strName", label: "Loan Name", required: true, gridCols: 6 },
  { name: "strLender", label: "Lender", gridCols: 6 },
  { name: "dPrincipal", label: "Principal", type: "peso", required: true, gridCols: 6 },
  { name: "dMonthlyPayment", label: "Monthly Payment", type: "peso", gridCols: 6 },
  { name: "dInterestRate", label: "Interest Rate (% / yr)", type: "number", gridCols: 6 },
  { name: "nTermMonths", label: "Term (months)", type: "number", gridCols: 6 },
  { name: "dStartDate", label: "Start Date", type: "date", required: true, gridCols: 6 },
  { name: "dEndDate", label: "End Date", type: "date", gridCols: 6 },
  { name: "nPaymentDay", label: "Payment Day (1–31)", type: "number", gridCols: 6 },
  {
    name: "cStatus",
    label: "Status",
    type: "select",
    required: true,
    gridCols: 6,
    options: [
      { label: "Active", value: "ACTIVE" },
      { label: "Paid", value: "PAID" },
      { label: "Defaulted", value: "DEFAULTED" },
    ],
  },
  { name: "strNotes", label: "Notes", multiline: true, minRows: 2, gridCols: 12 },
];

export default function LoansAEModal({
  open,
  onClose,
  onSave,
  editingLoan,
  formData,
  onChange,
  saving,
}) {
  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={editingLoan ? "Edit Loan" : "Add Loan"}
      subtitle={
        editingLoan
          ? formData.strName || `Loan #${editingLoan.nLoanId}`
          : "Track what you owe, month by month."
      }
      type={editingLoan ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingLoan ? "Save changes" : "Create loan"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields()}
        values={formData}
        onChange={onChange}
      />
    </ModalComponent>
  );
}
