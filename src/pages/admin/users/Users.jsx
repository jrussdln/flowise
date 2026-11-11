import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Avatar, Box, Stack, Typography, Alert, Snackbar } from "@mui/material";
import { Delete as DeleteIcon, Edit as EditIcon } from "@mui/icons-material";
import DataTable from "../../../components/ui/DataTable";
import FilterMenu from "../../../components/ui/FilterMenu";
import UserAEModal from "./modals/UserAEModal";
import { userService } from "../../../services/userService";

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

/* Whole days until the next occurrence of the birth date (0 = today,
   null when the row has no birth date). */
const daysUntilBirthday = (value) => {
  const birth = value ? new Date(value) : null;
  if (!birth || Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < now) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return Math.round((next - now) / 86400000);
};

/* cStatus values match the Status select in UserAEModal. */
const STATUS_META = {
  A: { label: "Active", color: "#2e7d32" },
  I: { label: "Inactive", color: "var(--text-muted)" },
  B: { label: "Blocked", color: "#f44336" },
  S: { label: "Suspended", color: "#ed6c02" },
};

/* cType values match the User Type select in UserAEModal. */
const TYPE_META = {
  U: { label: "User", color: "var(--text-primary)" },
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
  { value: "all", label: "All Types" },
  { value: "U", label: "User" },
  { value: "A", label: "Admin" },
];

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

  const handleOpenAdd = () => {
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
  };

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
       avatar on the left, then the full name with the username in
       italic on a line below it. */
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
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name || "—"}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "var(--text-muted)",
                  fontStyle: "italic",
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
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Email: {row.strEmail || "—"}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Phone: {row.strPhoneNo || "—"}
          </Typography>
        </Box>
      ),
    },
    {
      id: "dtBirthDate",
      label: "Birthdate",
      minWidth: 130,
      /* The date on top with the italic countdown ("34 days left")
         to the next birthday below it. */
      format: (value) => {
        const days = daysUntilBirthday(value);
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ color: "var(--text-primary)", fontWeight: 500 }}
            >
              {formatDate(value)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "var(--text-muted)",
                fontStyle: "italic",
              }}
            >
              {days === null
                ? ""
                : days === 0
                  ? "Today!"
                  : `${days} day${days === 1 ? "" : "s"} left`}
            </Typography>
          </Box>
        );
      },
    },
    /* Status on top, with the larger user type below it. */
    {
      id: "cType",
      label: "Type",
      minWidth: 120,
      align: "right",
      format: (value, row) => {
        const status = STATUS_META[row.cStatus] || {
          label: row.cStatus || "—",
          color: "var(--text-muted)",
        };
        const type = TYPE_META[value] || { label: value || "—", color: "var(--text-primary)" };
        return (
          <Box sx={{ minWidth: 0, textAlign: "right" }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: status.color,
                fontWeight: 700,
                fontSize: "0.68rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {status.label}
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: type.color, fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.2 }}
            >
              {type.label}
            </Typography>
          </Box>
        );
      },
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => (
        <Box sx={{ display: "flex", gap: 1, justifyContent: "center" }}>
          <EditIcon
            sx={{ cursor: "pointer", color: "var(--accent)", "&:hover": { opacity: 0.7 } }}
            onClick={() => handleOpenEdit(row)}
          />
          <DeleteIcon
            sx={{ cursor: "pointer", color: "#f44336", "&:hover": { opacity: 0.7 } }}
            onClick={() => handleDeleteUser(row.nUserId)}
          />
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

  return (
    <Box sx={{ width: "100%", p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
      
      <DataTable
        title="User Management"
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nUserId"
        onAddClick={handleOpenAdd}
        addButtonLabel="Add User"
        searchPlaceholder="Search by name, username, email..."
        searchFields={["fullName", "strFName", "strLName", "strUserName", "strEmail"]}
        filters={
          <>
            {/* <FilterMenu
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTER_OPTIONS}
              counts={statusCounts}
              label="Filter by status"
            /> */}
            <FilterMenu
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              counts={typeCounts}
              label="Filter by user type"
            />
          </>
        }
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
