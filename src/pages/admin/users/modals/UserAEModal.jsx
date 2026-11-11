import React from "react";
import ModalComponent from "../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../components/ui/FieldsComponent";

const getFormFields = (isEdit = false) => [
  { name: "strFName", label: "First Name", required: true, gridCols: 6 },
  { name: "strLName", label: "Last Name", required: true, gridCols: 6 },
  { name: "strUserName", label: "Username", type: "username", required: true, gridCols: 6 },
  {
    name: "strPassword",
    label: isEdit ? "New Password (optional)" : "Password",
    type: "password",
    required: !isEdit,
    gridCols: 6,
  },
  { name: "strEmail", label: "Email Address", type: "email", required: true, gridCols: 6 },
  { name: "strPhoneNo", label: "Phone Number", type: "phone", gridCols: 6 },
  { name: "dtBirthDate", label: "Birth Date", type: "date", gridCols: 6 },
  {
    name: "cType",
    label: "User Type",
    type: "select",
    required: true,
    gridCols: 6,
    options: [
      { label: "User", value: "U" },
      { label: "Admin", value: "A" },
    ],
  },
  {
    name: "cStatus",
    label: "Status",
    type: "select",
    required: true,
    gridCols: 6,
    options: [
      { label: "Active", value: "A" },
      { label: "Inactive", value: "I" },
      { label: "Blocked", value: "B" },
      { label: "Suspended", value: "S" },
    ],
  },
];

export default function UserAEModal({ open, onClose, onSave, editingUser, formData, onChange, saving }) {
  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={editingUser ? `Edit User #${editingUser.nUserId}` : "Add User"}
      type={editingUser ? "edit" : "add"}
      maxWidth="md"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingUser ? "Save changes" : "Create user"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields(Boolean(editingUser))}
        values={formData}
        onChange={onChange}
      />
    </ModalComponent>
  );
}
