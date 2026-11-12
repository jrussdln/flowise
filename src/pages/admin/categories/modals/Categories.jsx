import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { Category as CategoryIcon, Add as AddIcon } from "@mui/icons-material";
import Table from "../../../../components/ui/Table";
import FilterMenu from "../../../../components/ui/FilterMenu";
import CategoryAEModal from "./CategoryAEModal";
import { categoryService } from "../../../../services/categoryService";
import { useContentChrome } from "../../../../hooks/usePageChrome";
import {
  ADD_BUTTON_SX,
  PillBadge,
  RowActions,
  contentHeader,
  useToast,
} from "../../../shared/finance/shared";

const CONTENT_HEADER = contentHeader(CategoryIcon, "Categories");

const STATE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [stateFilter, setStateFilter] = useState("all");
  const { showToast, toastNode } = useToast();

  const handleOpenAdd = useCallback(() => {
    setEditingCategory(null);
    setFormData({
      strName: "",
      strColor: "#757575",
      bIsActive: true,
    });
    setModalOpen(true);
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await categoryService.list();
      setCategories(rows || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
      showToast(err.message || "Failed to load categories", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      strName: category.strName || "",
      strColor: category.strColor || "#757575",
      bIsActive: category.bIsActive !== false,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingCategory(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveCategory = async () => {
    if (!formData.strName?.trim()) {
      showToast("Category name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        strName: formData.strName.trim(),
        strColor: formData.strColor?.trim() || null,
        bIsActive: formData.bIsActive !== false,
      };

      if (editingCategory) {
        await categoryService.update(editingCategory.nCategoryId, payload);
        showToast("Category updated successfully!");
      } else {
        await categoryService.create(payload);
        showToast("Category created successfully!");
      }

      handleCloseModal();
      await fetchCategories();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save category", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;

    try {
      await categoryService.remove(id);
      showToast("Category deleted successfully!");
      await fetchCategories();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete category", "error");
    }
  };

  const columns = [
    /* A colored dot from the category's own strColor, then the name. */
    {
      id: "strName",
      label: "Category",
      minWidth: 200,
      format: (_, row) => (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              width: 12,
              height: 12,
              flexShrink: 0,
              borderRadius: "50%",
              border: "1px solid var(--border-medium)",
              backgroundColor: row.strColor || "var(--text-muted)",
            }}
          />
          <Typography
            variant="body2"
            sx={{
              color: row.bIsActive === false ? "var(--text-muted)" : "var(--text-primary)",
              fontWeight: 500,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.strName}
          </Typography>
        </Stack>
      ),
    },
    {
      id: "bIsActive",
      label: "Status",
      minWidth: 110,
      align: "center",
      format: (_, row) =>
        row.bIsActive !== false ? (
          <PillBadge meta={{ label: "Active", color: "#2e7d32" }} />
        ) : (
          <PillBadge fallback="Inactive" />
        ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => (
        <RowActions
          label={row.strName || "category"}
          onEdit={() => handleOpenEdit(row)}
          onDelete={() => handleDeleteCategory(row.nCategoryId)}
        />
      ),
    },
  ];

  /* The state filter only narrows the table — each option's count comes
     from every loaded row. */
  const visibleRows = useMemo(
    () =>
      categories.filter(
        (c) =>
          stateFilter === "all" ||
          (stateFilter === "active" ? c.bIsActive !== false : c.bIsActive === false)
      ),
    [categories, stateFilter]
  );

  const stateCounts = useMemo(
    () => ({
      all: categories.length,
      active: categories.filter((c) => c.bIsActive !== false).length,
      inactive: categories.filter((c) => c.bIsActive === false).length,
    }),
    [categories]
  );

  /* Content header, right side: the status filter, then the Add
     Category button. Memoized on stable deps so the published chrome
     node doesn't churn. */
  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <FilterMenu
          value={stateFilter}
          onChange={setStateFilter}
          options={STATE_FILTER_OPTIONS}
          counts={stateCounts}
          label="Filter by status"
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          aria-label="Add category"
          sx={ADD_BUTTON_SX}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Category
          </Box>
        </Button>
      </Stack>
    ),
    [handleOpenAdd, stateFilter, stateCounts]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nCategoryId"
        searchPlaceholder="Search by category name..."
        searchFields={["strName"]}
      />

      <CategoryAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveCategory}
        editingCategory={editingCategory}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      {toastNode}
    </Box>
  );
}
