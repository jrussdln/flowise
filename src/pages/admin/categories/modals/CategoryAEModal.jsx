import React from "react";
import { Box, Stack, TextField, Typography } from "@mui/material";
import ModalComponent from "../../../../components/ui/ModalComponent";
import FieldsComponent from "../../../../components/ui/FieldsComponent";

const getFormFields = (formData, onChange) => [
  { name: "strName", label: "Category Name", required: true, gridCols: 6 },
  /* Live color swatch + the stored hex. Saved as strColor on the row. */
  {
    name: "strColor",
    type: "custom",
    gridCols: 6,
    render: () => (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box
          component="input"
          type="color"
          aria-label="Pick category color"
          value={formData.strColor || "#757575"}
          onChange={(e) => onChange("strColor", e.target.value)}
          sx={{
            width: 40,
            height: 40,
            p: 0,
            border: "1px solid var(--border-medium)",
            borderRadius: 1,
            backgroundColor: "var(--bg-primary)",
            cursor: "pointer",
            "&::-webkit-color-swatch-wrapper": { p: "3px" },
            "&::-webkit-color-swatch": { border: "none", borderRadius: 0.75 },
          }}
        />
        <TextField
          label="Color"
          size="small"
          fullWidth
          value={formData.strColor || ""}
          onChange={(e) => onChange("strColor", e.target.value)}
          placeholder="#757575"
          sx={{
            "& .MuiInputBase-root": {
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-primary)",
            },
          }}
        />
      </Stack>
    ),
  },
  {
    name: "bIsActive",
    label: "Active (shows in dropdowns)",
    type: "checkbox",
    gridCols: 6,
  },
];

export default function CategoryAEModal({
  open,
  onClose,
  onSave,
  editingCategory,
  formData,
  onChange,
  saving,
}) {
  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={editingCategory ? "Edit Category" : "Add Category"}
      subtitle={
        editingCategory
          ? formData.strName || `Category #${editingCategory.nCategoryId}`
          : "Labels for money in and money out on the Ledger."
      }
      type={editingCategory ? "edit" : "add"}
      maxWidth="sm"
      onSave={onSave}
      saveLabel={saving ? "Saving…" : editingCategory ? "Save changes" : "Create category"}
      saving={saving}
    >
      <FieldsComponent
        fields={getFormFields(formData, onChange)}
        values={formData}
        onChange={onChange}
      />
      <Typography
        variant="caption"
        sx={{ display: "block", mt: 0.5, color: "var(--text-muted)" }}
      >
        Duplicate category names are not allowed.
      </Typography>
    </ModalComponent>
  );
}
