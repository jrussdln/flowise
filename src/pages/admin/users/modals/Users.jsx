import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Avatar, Box, IconButton, Stack, Typography, Alert, Snackbar, Button } from "@mui/material";
import { Delete as DeleteIcon, Edit as EditIcon, Group as GroupIcon, Add as AddIcon } from "@mui/icons-material";
import Table from "../../../../components/ui/Table";
import FilterMenu from "../../../../components/ui/FilterMenu";
import UserAEModal from "./UserAEModal";
import { userService } from "../../../../services/userService";
import { useContentChrome } from "../../../../hooks/usePageChrome";
import { PillBadge } from "../../../shared/finance/shared";

/* Content-card header published to PageLayout. Defined at module
   level so its identity is stable across renders. */
const CONTENT_HEADER = (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
    <Box
      sx={{
        color: "var(--accent)",
        display: "flex",
        "& svg": { fontSize: { xs: 16, sm: 18 } },
      }}
    >
      <GroupIcon />
    </Box>
    <Typography
      component="div"
      sx={{
        fontWeight: 500,
        fontSize: { xs: "0.72rem", sm: "0.85rem" },
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-primary)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      Users
    </Typography>
  </Stack>
);

/* cType values match the User Type select in UserAEModal. */
const ROLE_META = {
  U: { label: "User", color: "var(--text-muted)" },
  A: { label: "Admin", color: "#7b1fa2" },
};

/* The two dropdown filters below the search row — each "all" option
   shows every row (each value stays selectable from its menu). */
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "A", label: "Active" },
  { value: "I", label: "Inactive" },
  { value: "B", label: "Blocked" },
  { value: "S", label: "Suspended" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "U", label: "User" },
  { value: "A", label: "Admin" },
];

/* Pill colors per account status (cStatus codes match the Status
   select in UserAEModal). */
const STATUS_META = {
  A: { label: "Active", color: "#2e7d32" },
  I: { label: "Inactive", color: "var(--text-muted)" },
  B: { label: "Blocked", color: "#d32f2f" },
  S: { label: "Suspended", color: "#d97706" },
};

/* { all: rows.length, A: n, B: n, ... } — per-option row counts for a
   FilterMenu, counting over every loaded row (like the transactions
   page) rather than the row the other filter already narrowed to. */
const buildCounts = (rows, field, options) =>
  Object.fromEntries([
    ["all", rows.length],
    ...options
      .filter((o) => o.value !== "all")
      .map((o) => [o.value, rows.filter((u) => u[field] === o.value).length]),
  ]);

/* Shared chrome for the Add-User button (module level so the styles
   node is stable); the node itself is memoized on the handler below. */
const addButtonSx = {
  backgroundColor: "var(--accent)",
  color: "var(--bg-primary)",
  fontWeight: 600,
  textTransform: "none",
  borderRadius: 3,
  px: { xs: 1.5, sm: 2.5 },
  boxShadow: "none",
  "&:hover": {
    backgroundColor: "var(--accent)",
    opacity: 0.9,
    boxShadow: "0 4px 12px var(--shadow-hover)",
  },
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  /* Show the "Users Management" bar in the content card header; the
     type filter and Add User button are published with it below (they
     need the counts, which are computed further down). */
  const handleOpenAdd = useCallback(() => {
    setEditingUser(null);
    setFormData({
      strFName: "",
      strLName: "",
      strUserName: "",
      strPassword: "",
      strEmail: "",
      strPhoneNo: "",
      dtBirthDate: "",
      cType: "U",
      cStatus: "A",
    });
    setModalOpen(true);
  }, []);

  const showToast = (message, severity = "success") => {
    setToast({ open: true, message, severity });
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userService.list();
      setUsers(data || []);
    } catch (err) {
      console.error("Error fetching users:", err);
      showToast(err.message || "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      strFName: user.strFName || "",
      strLName: user.strLName || "",
      strUserName: user.strUserName || "",
      strPassword: "",
      strEmail: user.strEmail || "",
      strPhoneNo: user.strPhoneNo || "",
      dtBirthDate: user.dtBirthDate || "",
      cType: user.cType || "U",
      cStatus: user.cStatus || "A",
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingUser(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveUser = async () => {
    if (!formData.strFName?.trim() || !formData.strLName?.trim()) {
      showToast("First and Last name are required.", "warning");
      return;
    }
    if (!formData.strUserName?.trim()) {
      showToast("Username is required.", "warning");
      return;
    }
    if (!formData.strEmail?.trim()) {
      showToast("Email address is required.", "warning");
      return;
    }
    if (!editingUser && !formData.strPassword) {
      showToast("Password is required for new users.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const updatePayload = {
          strFName: formData.strFName.trim(),
          strLName: formData.strLName.trim(),
          strUserName: formData.strUserName.trim(),
          strEmail: formData.strEmail.trim(),
          strPhoneNo: formData.strPhoneNo?.trim() || null,
          dtBirthDate: formData.dtBirthDate || null,
          cType: formData.cType,
          cStatus: formData.cStatus,
        };
        if (formData.strPassword) {
          updatePayload.strPassword = formData.strPassword;
        }

        await userService.update(editingUser.nUserId, updatePayload);
        showToast("User updated successfully!");
      } else {
        const insertPayload = {
          strFName: formData.strFName.trim(),
          strLName: formData.strLName.trim(),
          strUserName: formData.strUserName.trim(),
          strPassword: formData.strPassword,
          strEmail: formData.strEmail.trim(),
          strPhoneNo: formData.strPhoneNo?.trim() || null,
          dtBirthDate: formData.dtBirthDate || null,
          cType: formData.cType,
          cStatus: formData.cStatus,
        };

        await userService.create(insertPayload);
        showToast("User created successfully!");
      }

      handleCloseModal();
      await fetchUsers();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save user", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    try {
      await userService.remove(id);
      showToast("User deleted successfully!");
      await fetchUsers();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete user", "error");
    }
  };

  const columns = [
    /* The old ID and Username columns folded in here: a round initials
       avatar on the left, then the full name with the username on a
       line below it. */
    {
      id: "fullName",
      label: "Name",
      minWidth: 200,
      format: (_, row) => {
        const name = `${row.strFName || ""} ${row.strLName || ""}`.trim();
        const initials =
          `${(row.strFName || "").charAt(0)}${(row.strLName || "").charAt(0)}`.toUpperCase() ||
          "?";
        return (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Avatar
              sx={{
                width: 34,
                height: 34,
                flexShrink: 0,
                bgcolor: "var(--accent)",
                color: "var(--bg-primary)",
                fontSize: "0.8rem",
                fontWeight: 700,
                border: "1px solid var(--border-light)",
              }}
            >
              {initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  lineHeight: 1.25,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name || "—"}
                {/* Role badge right after the name (Admin stands out
                    in purple; plain users get a muted pill). */}
                {(() => {
                  const role = ROLE_META[row.cType] || { label: row.cType || "—", color: "var(--text-muted)" };
                  return (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.75,
                        px: 1,
                        py: "1px",
                        borderRadius: 999,
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        verticalAlign: "middle",
                        color: role.color,
                        backgroundColor:
                          role.color === "var(--text-muted)"
                            ? "var(--overlay-dark)"
                            : `${role.color}1A`,
                        border: `1px solid ${role.color === "var(--text-muted)" ? "var(--border-light)" : `${role.color}33`}`,
                      }}
                    >
                      {role.label}
                    </Box>
                  );
                })()}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  lineHeight: 1.25,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.strUserName || "—"}
              </Typography>
            </Box>
          </Stack>
        );
      },
    },
    /* The old Email column, now carrying both contact lines. */
    {
      id: "strEmail",
      label: "Contact",
      minWidth: 220,
      format: (_, row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              color: "var(--text-primary)",
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.strEmail || "—"}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "var(--text-muted)",
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.strPhoneNo || "—"}
          </Typography>
        </Box>
      ),
    },
    {
      id: "cStatus",
      label: "Status",
      minWidth: 110,
      align: "center",
      format: (_, row) => (
        <PillBadge meta={STATUS_META[row.cStatus]} fallback={row.cStatus} />
      ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      /* Edit and delete as bordered icon buttons — each with its own
         tinted background so they read as distinct controls. */
      format: (_, row) => (
        <Box sx={{ display: "flex", gap: 0.75, justifyContent: "center" }}>
          <IconButton
            size="small"
            aria-label={`Edit ${row.strFName || ""} ${row.strLName || ""}`.trim() || "Edit user"}
            onClick={() => handleOpenEdit(row)}
            sx={{
              borderRadius: 1.5,
              color: "var(--accent)",
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
              "&:hover": {
                backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
              },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Delete ${row.strFName || ""} ${row.strLName || ""}`.trim() || "Delete user"}
            onClick={() => handleDeleteUser(row.nUserId)}
            sx={{
              borderRadius: 1.5,
              color: "#f44336",
              backgroundColor: "color-mix(in srgb, #f44336 12%, transparent)",
              "&:hover": {
                backgroundColor: "color-mix(in srgb, #f44336 22%, transparent)",
              },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  const rowsWithSearchKeys = useMemo(
    () =>
      users.map((u) => ({
        ...u,
        fullName: `${u.strFName || ""} ${u.strLName || ""}`.trim(),
      })),
    [users]
  );

  /* The two filters only narrow the table — each option's count comes
     from every loaded row, like the transactions page. */
  const visibleRows = useMemo(
    () =>
      rowsWithSearchKeys.filter(
        (u) =>
          (statusFilter === "all" || u.cStatus === statusFilter) &&
          (typeFilter === "all" || u.cType === typeFilter)
      ),
    [rowsWithSearchKeys, statusFilter, typeFilter]
  );

  const statusCounts = useMemo(
    () => buildCounts(rowsWithSearchKeys, "cStatus", STATUS_FILTER_OPTIONS),
    [rowsWithSearchKeys]
  );
  const typeCounts = useMemo(
    () => buildCounts(rowsWithSearchKeys, "cType", TYPE_FILTER_OPTIONS),
    [rowsWithSearchKeys]
  );

  /* Content header, right side: the type + status filters, then the
     Add User button — before it, per the layout. Memoized on stable
     deps so the published chrome node doesn't churn. */
  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <FilterMenu
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_FILTER_OPTIONS}
          counts={typeCounts}
          label="Filter by user type"
        />
        <FilterMenu
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS}
          counts={statusCounts}
          label="Filter by status"
        />
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          aria-label="Add user"
          sx={{
            ...addButtonSx,
            height: { xs: 32, sm: 36 },
            minHeight: { xs: 32, sm: 36 },
            fontSize: { xs: "0.75rem", sm: "0.8rem" },
            px: { xs: 0.75, sm: 1.75 },
            "& .MuiButton-startIcon": { m: { xs: 0, sm: "0 6px 0 -4px" } },
            "& svg": { fontSize: { xs: 16, sm: 18 } },
          }}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            User
          </Box>
        </Button>
      </Stack>
    ),
    [handleOpenAdd, typeFilter, typeCounts, statusFilter, statusCounts]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nUserId"
        searchPlaceholder="Search by name, username, email..."
        searchFields={["fullName", "strFName", "strLName", "strUserName", "strEmail"]}
      />

      <UserAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveUser}
        editingUser={editingUser}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast((prev) => ({ ...prev, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
