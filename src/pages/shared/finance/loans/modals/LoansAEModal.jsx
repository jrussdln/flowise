import { Box, Stack, Typography } from "@mui/material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";
import { loanSchedule } from "../../shared";

const getFormFields = (accounts = [], formData = {}) => {
  /* Lender vs Linked Account are alternatives (external lender vs a
     Loan account here), as are Monthly Payment vs Interest Rate —
     filling one disables the other. */
  const lenderSet = Boolean(formData.strLender && formData.strLender.trim());
  const accountSet = formData.nAccountId !== "" && formData.nAccountId != null;
  const monthlySet = formData.dMonthlyPayment !== "" && formData.dMonthlyPayment != null;
  const rateSet = formData.dInterestRate !== "" && formData.dInterestRate != null;

  return [
    { name: "strName", label: "Loan Name", required: true, gridCols: 12 },
    {
      name: "nAccountId",
      label: "Linked Account",
      type: "select",
      gridCols: 6,
      /* Only Loan-type accounts — this is what the Accounts page's Loan
         viewer reads to list this loan. Each option shows the account's
         live balance, like the Ledger's account fields:
         "MariBank - Mari Loan (₱15,000.00)". */
      options: accounts.map((a) => ({
        label: `${a.strName}${a.strInstitution ? ` - ${a.strInstitution}` : ""}${
          a.dBalance != null ? ` (${peso(a.dBalance)})` : ""
        }`,
        value: a.nAccountId,
      })),
      emptyText: "No Loan accounts yet — create one on the Accounts page.",
      disabled: lenderSet,
      helperText: lenderSet ? "Using Lender" : "Optional — links this loan to a Loan account",
    },
    {
      name: "strLender",
      label: "Lender",
      gridCols: 6,
      disabled: accountSet,
      helperText: accountSet ? "Using Linked Account" : undefined,
    },
    { name: "dPrincipal", label: "Principal", type: "peso", required: true, gridCols: 6 },
    { name: "nTermMonths", label: "Term (months)", type: "number", gridCols: 6 },
    /* Monthly Payment and Interest Rate are alternatives — fill one or
        the other, never both. */
    {
      name: "dMonthlyPayment",
      label: "Monthly Payment",
      type: "peso",
      gridCols: 6,
      disabled: rateSet,
      helperText: rateSet ? "Using Interest Rate" : "Optional — either this or Interest Rate, not both",
    },
    {
      name: "dInterestRate",
      label: "Interest Rate (% / term)",
      type: "number",
      gridCols: 6,
      disabled: monthlySet,
      helperText: monthlySet ? "Using Monthly Payment" : "Optional — either this or Monthly Payment, not both",
    },
    { name: "dStartDate", label: "Start Date", type: "date", required: true, gridCols: 6 },
    { name: "nPaymentDay", label: "Payment Day (1–31)", type: "number", gridCols: 6 },
    { name: "strNotes", label: "Notes", multiline: true, minRows: 2, gridCols: 12 },
  ];
};

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
  accounts = [],
  loans = [],
  paidCounts = new Map(),
}) {
  /* The selected Loan account caps the principal — you can't borrow
     more than the credit left on it. Editing frees this loan's own
     outstanding back into the pot first, so lowering an existing loan
     never trips the guard. */
  const linkedAccount = accounts.find(
    (a) => a.nAccountId === Number(formData.nAccountId)
  );
  let available = linkedAccount?.dBalance != null ? Number(linkedAccount.dBalance) : null;
  if (
    available != null &&
    editingLoan &&
    Number(editingLoan.nAccountId) === Number(linkedAccount.nAccountId)
  ) {
    const current = loans.find((l) => l.nLoanId === editingLoan.nLoanId);
    const prevPrincipal = Number(current?.dPrincipal || 0);
    const prevTerm = Number(current?.nTermMonths || 0);
    if (prevPrincipal > 0 && prevTerm > 0) {
      const paid0 = Math.min(paidCounts.get(current.nLoanId) || 0, prevTerm);
      available += prevPrincipal - paid0 * (prevPrincipal / prevTerm);
    }
  }
  if (available != null) available = Math.round(available * 100) / 100;
  const principalExceeds =
    available != null &&
    Number(formData.dPrincipal || 0) > 0 &&
    Number(formData.dPrincipal) > available;

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
        fields={getFormFields(accounts, formData)}
        values={formData}
        onChange={onChange}
        errors={
          principalExceeds
            ? {
                dPrincipal: `Exceeds the linked account's available balance (${peso(available)})`,
              }
            : undefined
        }
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
