import ModalComponent from "../../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../../components/ui/FieldsComponent";

const getFormFields = () => [
  { name: "strName", label: "Goal Name", required: true, gridCols: 6 },
  { name: "dTargetAmount", label: "Target Amount", type: "peso", gridCols: 6 },
  { name: "dTargetDate", label: "Target Date", type: "date", gridCols: 6 },
  {
    name: "cStatus",
    label: "Status",
    type: "select",
    required: true,
    gridCols: 6,
    options: [
      { label: "Active", value: "ACTIVE" },
      { label: "Reached", value: "REACHED" },
      { label: "Closed", value: "CLOSED" },
    ],
  },
  { name: "strNotes", label: "Notes", multiline: true, minRows: 2, gridCols: 12 },
];

export default function SavingsAEModal({
  open,
  onClose,
  onSave,
  editingGoal,
  formData,
  onChange,
  saving,
}) {
  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={editingGoal ? "Edit Savings Goal" : "Add Savings Goal"}
      subtitle={
        editingGoal
          ? formData.strName || `Goal #${editingGoal.nSavingsId}`
          : "Set a target and watch the fund grow."
      }
      type={editingGoal ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingGoal ? "Save changes" : "Create goal"}
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
