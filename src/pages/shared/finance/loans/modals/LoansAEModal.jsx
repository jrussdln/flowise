import { Box, Stack, Typography } from "@mui/material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";
import { loanSchedule } from "../../shared";

const getFormFields = () => [
  { name: "strName", label: "Loan Name", required: true, gridCols: 6 },
  { name: "strLender", label: "Lender", gridCols: 6 },
  { name: "dPrincipal", label: "Principal", type: "peso", required: true, gridCols: 6 },
  { name: "nTermMonths", label: "Term (months)", type: "number", gridCols: 6 },
  /* Monthly Payment and Interest Rate are alternatives — fill one or
     the other, never both. */
  { name: "dMonthlyPayment", label: "Monthly Payment", type: "peso", gridCols: 6, helperText: "Optional — either this or Interest Rate, not both" },
  { name: "dInterestRate", label: "Interest Rate (% / term)", type: "number", gridCols: 6, helperText: "Optional — either this or Monthly Payment, not both" },
  { name: "dStartDate", label: "Start Date", type: "date", required: true, gridCols: 6 },
  { name: "nPaymentDay", label: "Payment Day (1–31)", type: "number", gridCols: 6 },
  { name: "strNotes", label: "Notes", multiline: true, minRows: 2, gridCols: 12 },
];

const peso = (value) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* How many sample cards to show before "…and N more". */
const MAX_PREVIEW = 6;

export default function LoansAEModal({
  open,
  onClose,
  onSave,
  editingLoan,
  formData,
  onChange,
  saving,
}) {
  /* Sample entries share the same schedule math as posting (shared.jsx)
     — principal × (1 + rate% × term) ÷ term when only the rate is set. */
  const schedule = loanSchedule(formData);

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

      {/* Sample entries — appears once the term + a monthly amount
          (payment or rate-derived) can produce a schedule. */}
      {schedule && (
        <Box sx={{ mt: 1 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mb: 0.75,
              color: "var(--text-muted)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Sample entries{schedule.length > MAX_PREVIEW ? ` (first ${MAX_PREVIEW})` : ""} ·{" "}
            {peso(schedule[0].amount)} / month
          </Typography>
          <Stack spacing={0.75}>
            {schedule.slice(0, MAX_PREVIEW).map((entry, index) => (
              <Box
                key={entry.label}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  p: 1,
                  border: "1px solid var(--border-light)",
                  borderRadius: 2,
                  backgroundColor: "var(--bg-secondary)",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "var(--text-primary)",
                      fontWeight: 600,
                      lineHeight: 1.25,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {index + 1}. {entry.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "var(--text-muted)", lineHeight: 1.25 }}>
                    Due {entry.due}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    color: "var(--text-primary)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {peso(entry.amount)}
                </Typography>
              </Box>
            ))}
          </Stack>
          {schedule.length > MAX_PREVIEW && (
            <Typography
              variant="caption"
              sx={{ display: "block", mt: 0.75, color: "var(--text-muted)", fontStyle: "italic" }}
            >
              …and {schedule.length - MAX_PREVIEW} more month
              {schedule.length - MAX_PREVIEW === 1 ? "" : "s"} until{" "}
              {schedule[schedule.length - 1].label}.
            </Typography>
          )}
        </Box>
      )}
    </ModalComponent>
  );
}
