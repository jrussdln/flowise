import React, { useCallback, useMemo, useState } from "react";
import { Box, Button, IconButton, ListItemButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import {
  AccountBalance as AccountsIcon,
  AccountBalanceOutlined as BankIcon,
  AccountBalanceWalletOutlined as EWalletIcon,
  Add as AddIcon,
  CreditCardOutlined as DebitIcon,
  CreditScoreOutlined as CreditIcon,
  KeyboardArrowDownOutlined as ChevronDownIcon,
  PaymentsOutlined as CashIcon,
  PublishedWithChangesOutlined as StatusIcon,
  SwapHorizOutlined as SwapIcon,
  VisibilityOutlined as ViewIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import Table from "../../../../../components/ui/Table";
import FilterCards from "../../../../../components/ui/FilterCards";
import AccountsAEModal from "./AccountsAEModal";
import ViewLedgerEntriesModal from "./ViewLedgerEntriesModal";
import LedgerAEModal from "../../ledger/modals/LedgerAEModal";
import { accountService } from "../../../../../services/accountService";
import { ledgerService } from "../../../../../services/ledgerService";
import { useContentChrome } from "../../../../../hooks/usePageChrome";
import {
  PillBadge,
  RowActions,
  accountBalance,
  buildCounts,
  contentHeader,
  creditBalance,
  useToast,
} from "../../shared";

const CONTENT_HEADER = contentHeader(AccountsIcon, "Accounts");

/* Pill colors + icons per account type (icon renders as a tinted
   circle on the left of the Account cell, Ledger-style). */
const TYPE_META = {
  CASH: { label: "Cash", color: "#2e7d32", Icon: CashIcon },
  BANK: { label: "Bank", color: "#1565c0", Icon: BankIcon },
  DEBIT: { label: "Debit", color: "#00897b", Icon: DebitIcon },
  CREDIT: { label: "Credit", color: "#d97706", Icon: CreditIcon },
  EWALLET: { label: "E-Wallet", color: "#7b1fa2", Icon: EWalletIcon },
};

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
  { value: "EWALLET", label: "E-Wallet" },
];

const STATE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/* Colors for the row-level status dot/button (like Ledger's). */
const STATE_META = {
  active: { label: "Active", color: "#2e7d32" },
  inactive: { label: "Inactive", color: "var(--text-muted)" },
};

const peso = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(true);

  /* Inline status changer: the Actions cell has a status button whose
     popover (tooltip-style) lists Active/Inactive. */
  const [statusAnchor, setStatusAnchor] = useState(null);
  const [statusRow, setStatusRow] = useState(null);

  /* Read-only viewer: shows the ledger entries of one account. */
  const [viewAccount, setViewAccount] = useState(null);

  /* Quick transfer: opens the Ledger Add modal preset to a TRF from
     this account (title + From account prefilled). */
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState(null);
  const { showToast, toastNode } = useToast();

  const handleOpenAdd = useCallback(() => {
    setEditingAccount(null);
    setFormData({
      strName: "",
      cAccountType: "CASH",
      strInstitution: "",
      strLast4: "",
      strCurrency: "PHP",
      dOpeningBalance: "0.00",
      dCreditLimit: "",
      nStatementDay: "",
      nDueDay: "",
      bIsActive: true,
    });
    setModalOpen(true);
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      /* Compute every balance live from the ledger entries so it
         always agrees with the rows the user sees — voiding or
         re-posting an entry instantly changes the balance. Credit
         cards use limit − unpaid charges instead. */
      const [rows, ledgerRows] = await Promise.all([
        accountService.list(),
        ledgerService.list().catch(() => []),
      ]);
      setAccounts(
        (rows || []).map((a) => ({
          ...a,
          dBalance:
            a.cAccountType === "CREDIT" ? creditBalance(a, ledgerRows) : accountBalance(a, ledgerRows),
        }))
      );
    } catch (err) {
      console.error("Error fetching accounts:", err);
      showToast(err.message || "Failed to load accounts", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleOpenEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      strName: account.strName || "",
      cAccountType: account.cAccountType || "CASH",
      strInstitution: account.strInstitution || "",
      strLast4: account.strLast4 || "",
      strCurrency: account.strCurrency || "PHP",
      dOpeningBalance: account.dOpeningBalance ?? "",
      dCreditLimit: account.dCreditLimit ?? "",
      nStatementDay: account.nStatementDay ?? "",
      nDueDay: account.nDueDay ?? "",
      bIsActive: account.bIsActive !== false,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingAccount(null);
  };

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveAccount = async () => {
    if (!formData.strName?.trim()) {
      showToast("Account name is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        strName: formData.strName.trim(),
        cAccountType: formData.cAccountType,
        strInstitution: formData.strInstitution?.trim() || null,
        strLast4: formData.strLast4?.trim() || null,
        strCurrency: formData.strCurrency?.trim() || "PHP",
        dOpeningBalance: formData.dOpeningBalance === "" ? 0 : Number(formData.dOpeningBalance),
        dCreditLimit:
          formData.cAccountType === "CREDIT" && formData.dCreditLimit !== ""
            ? Number(formData.dCreditLimit)
            : null,
        nStatementDay:
          formData.cAccountType === "CREDIT" && formData.nStatementDay
            ? Number(formData.nStatementDay)
            : null,
        nDueDay:
          formData.cAccountType === "CREDIT" && formData.nDueDay
            ? Number(formData.nDueDay)
            : null,
        bIsActive: formData.bIsActive !== false,
      };

      if (editingAccount) {
        await accountService.update(editingAccount.nAccountId, payload);
        showToast("Account updated successfully!");
      } else {
        await accountService.create(payload);
        showToast("Account created successfully!");
      }

      handleCloseModal();
      await fetchAccounts();
    } catch (err) {
      console.error("Save error:", err);
      showToast(err.message || "Failed to save account", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm("Are you sure you want to delete this account?")) return;

    try {
      await accountService.remove(id);
      showToast("Account deleted successfully!");
      await fetchAccounts();
    } catch (err) {
      console.error("Delete error:", err);
      showToast(err.message || "Failed to delete account", "error");
    }
  };

  /* Quick transfer from a row: presets the Ledger Add modal to a TRF
     with the title and From account filled in. */
  const handleOpenTransfer = (row) => {
    setTransferForm({
      strTitle: `Transfer - ${row.strName}`,
      cType: "TRF",
      dAmount: "",
      dFee: "",
      dTransactionDate: new Date().toISOString().slice(0, 10),
      nAccountId: row.nAccountId,
      nToAccountId: "",
      nCategoryId: "",
      strMerchant: "",
      strReference: "",
      cStatus: "POSTED",
      strNotes: "",
    });
    setTransferOpen(true);
  };
  const handleCloseTransfer = () => {
    if (saving) return;
    setTransferOpen(false);
    setTransferForm(null);
  };
  const handleSaveTransfer = async () => {
    if (!transferForm.dAmount || Number(transferForm.dAmount) <= 0) {
      showToast("Amount must be greater than zero.", "warning");
      return;
    }
    if (!transferForm.nToAccountId) {
      showToast("A transfer needs a destination account.", "warning");
      return;
    }

    /* Insufficient funds: amount + fee must fit the From account's
       balance (for credit cards, the available credit). */
    const source = accounts.find((a) => a.nAccountId === Number(transferForm.nAccountId));
    const fee = transferForm.dFee === "" || transferForm.dFee == null ? 0 : Number(transferForm.dFee);
    const total = Number(transferForm.dAmount) + fee;
    const balance = Number(source?.dBalance ?? 0);
    if (source && total > balance) {
      showToast(
        `Amount + fee (₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) exceeds ${source.strName}'s balance (₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}).`,
        "warning"
      );
      return;
    }

    setSaving(true);
    try {
      await ledgerService.create({
        strTitle: transferForm.strTitle.trim(),
        cType: "TRF",
        dAmount: Number(transferForm.dAmount),
        dFee: transferForm.dFee === "" ? 0 : Number(transferForm.dFee),
        dTransactionDate: transferForm.dTransactionDate,
        nAccountId: Number(transferForm.nAccountId),
        nToAccountId: Number(transferForm.nToAccountId),
        nCategoryId: null,
        strMerchant: transferForm.strMerchant?.trim() || null,
        strReference: transferForm.strReference?.trim() || null,
        cStatus: "POSTED",
        strNotes: transferForm.strNotes?.trim() || null,
      });
      showToast("Transfer added successfully!");
      handleCloseTransfer();
      await fetchAccounts();
    } catch (err) {
      console.error("Transfer error:", err);
      showToast(err.message || "Failed to save transfer", "error");
    } finally {
      setSaving(false);
    }
  };

  /* Quick transfer from the header: opens the Ledger Add modal preset
     to a TRF with nothing prefilled. */
  const handleOpenTransferHeader = () => {
    setTransferForm({
      strTitle: "",
      cType: "TRF",
      dAmount: "",
      dFee: "",
      dTransactionDate: new Date().toISOString().slice(0, 10),
      nAccountId: "",
      nToAccountId: "",
      nCategoryId: "",
      strMerchant: "",
      strReference: "",
      cStatus: "POSTED",
      strNotes: "",
    });
    setTransferOpen(true);
  };

  /* Popover-based status changer on the Actions cell. */
  const handleOpenStatus = (row, event) => {
    setStatusAnchor(event.currentTarget);
    setStatusRow(row);
  };
  const handleCloseStatus = () => {
    setStatusAnchor(null);
    setStatusRow(null);
  };
  const handleStatusChange = async (row, nextState) => {
    handleCloseStatus();
    const nextActive = nextState === "active";
    if (nextActive === (row.bIsActive !== false)) return;
    try {
      await accountService.update(row.nAccountId, { bIsActive: nextActive });
      showToast(`Account marked ${STATE_META[nextState].label.toLowerCase()}!`);
      await fetchAccounts();
    } catch (err) {
      console.error("Status change error:", err);
      showToast(err.message || "Failed to update status", "error");
    }
  };

  const columns = [
    {
      id: "strName",
      label: "Account",
      minWidth: 200,
      format: (_, row) => {
        /* Tinted type circle on the left (Ledger-style), name + type
           pill and the institution/last-4 caption on the right. */
        const meta = TYPE_META[row.cAccountType] || { color: "var(--text-muted)" };
        return (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box
              sx={{
                position: "relative",
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                color: meta.color,
                "& svg": { fontSize: 16 },
              }}
            >
              {meta.Icon ? <meta.Icon /> : null}
              {/* Status dot pinned over the icon's upper-right edge:
                  green = active, gray = inactive. */}
              <Box
                aria-hidden
                sx={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: row.bIsActive !== false ? STATE_META.active.color : STATE_META.inactive.color,
                  border: "1.5px solid var(--card-bg)",
                }}
              />
            </Box>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                {row.strName || "—"}
                <PillBadge meta={TYPE_META[row.cAccountType]} fallback={row.cAccountType} />
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
                {[row.strInstitution, row.strLast4 ? `••••${row.strLast4}` : ""]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </Typography>
            </Box>
          </Stack>
        );
      },
    },
    {
      id: "dBalance",
      label: "Balance",
      minWidth: 140,
      align: "right",
      format: (_, row) => (
        <Typography
          variant="body2"
          sx={{
            color: row.dBalance != null && Number(row.dBalance) < 0 ? "#d32f2f" : "var(--text-primary)",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {peso(row.dBalance ?? row.dOpeningBalance)}
        </Typography>
      ),
    },
    {
      id: "actions",
      label: "Actions",
      minWidth: 110,
      align: "center",
      format: (_, row) => {
        const stateKey = row.bIsActive !== false ? "active" : "inactive";
        const state = STATE_META[stateKey];
        /* View opens the account's ledger entries; status opens the
           Active/Inactive popover. Both render between Edit and Delete
           via RowActions' extra slot (Edit → View → Status → Delete). */
        const viewButton = (
          <Tooltip title="View ledger entries" arrow>
            <IconButton
              size="small"
              aria-label={`View ledger entries of ${row.strName || "account"}`}
              onClick={() => setViewAccount(row)}
              sx={{
                borderRadius: 1.5,
                color: "#2563eb",
                backgroundColor: "color-mix(in srgb, #2563eb 12%, transparent)",
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, #2563eb 22%, transparent)",
                },
              }}
            >
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
        const transferButton = (
          <Tooltip title={`New transfer from ${row.strName || "account"}`} arrow>
            <IconButton
              size="small"
              aria-label={`New transfer from ${row.strName || "account"}`}
              onClick={() => handleOpenTransfer(row)}
              sx={{
                borderRadius: 1.5,
                color: "#1565c0",
                backgroundColor: "color-mix(in srgb, #1565c0 12%, transparent)",
                "&:hover": {
                  backgroundColor: "color-mix(in srgb, #1565c0 22%, transparent)",
                },
              }}
            >
              <SwapIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
        const statusButton = (
          <Tooltip title={`Change status (now: ${state.label})`} arrow>
            <IconButton
              size="small"
              aria-label={`Change status of ${row.strName || "account"}`}
              onClick={(event) => handleOpenStatus(row, event)}
              sx={{
                borderRadius: 1.5,
                color: state.color,
                backgroundColor: `color-mix(in srgb, ${state.color} 12%, transparent)`,
                "&:hover": {
                  backgroundColor: `color-mix(in srgb, ${state.color} 22%, transparent)`,
                },
              }}
            >
              <StatusIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
        return (
          <RowActions
            label={row.strName || "account"}
            extra={[viewButton, transferButton, statusButton]}
            onEdit={() => handleOpenEdit(row)}
            onDelete={() => handleDeleteAccount(row.nAccountId)}
          />
        );
      },
    },
  ];

  /* Two filters narrow the table; counts come from every loaded row. */
  const visibleRows = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (typeFilter === "all" || a.cAccountType === typeFilter) &&
          (stateFilter === "all" ||
            (stateFilter === "active" ? a.bIsActive !== false : a.bIsActive === false))
      ),
    [accounts, typeFilter, stateFilter]
  );

  const typeCounts = useMemo(
    () => buildCounts(accounts, "cAccountType", TYPE_FILTER_OPTIONS),
    [accounts]
  );
  const stateCounts = useMemo(
    () =>
      Object.fromEntries([
        ["all", accounts.length],
        ["active", accounts.filter((a) => a.bIsActive !== false).length],
        ["inactive", accounts.filter((a) => a.bIsActive === false).length],
      ]),
    [accounts]
  );

  const contentActions = useMemo(
    () => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          aria-label="Add account"
          sx={{
            height: { xs: 30, sm: 34 },
            minHeight: { xs: 30, sm: 34 },
            px: { xs: 0.75, sm: 1.5 },
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "var(--border-medium)",
            backgroundColor: "var(--bg-secondary)",
            color: "var(--accent)",
            fontWeight: 600,
            fontSize: { xs: "0.7rem", sm: "0.78rem" },
            textTransform: "none",
            whiteSpace: "nowrap",
            "& .MuiButton-startIcon": { mr: { xs: 0, sm: 0.5 } },
            "& svg": { fontSize: { xs: 15, sm: 17 } },
            "&:hover": {
              borderColor: "var(--accent)",
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
            },
          }}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Account
          </Box>
        </Button>
        <Button
          startIcon={<SwapIcon />}
          onClick={handleOpenTransferHeader}
          aria-label="Add transfer"
          sx={{
            height: { xs: 30, sm: 34 },
            minHeight: { xs: 30, sm: 34 },
            px: { xs: 0.75, sm: 1.5 },
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "var(--border-medium)",
            backgroundColor: "var(--bg-secondary)",
            color: "#1565c0",
            fontWeight: 600,
            fontSize: { xs: "0.7rem", sm: "0.78rem" },
            textTransform: "none",
            whiteSpace: "nowrap",
            "& .MuiButton-startIcon": { mr: { xs: 0, sm: 0.5 } },
            "& svg": { fontSize: { xs: 15, sm: 17 } },
            "&:hover": {
              borderColor: "#1565c0",
              backgroundColor: "color-mix(in srgb, #1565c0 12%, transparent)",
            },
          }}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Transfer
          </Box>
        </Button>
      </Stack>
    ),
    [handleOpenAdd]
  );

  useContentChrome({ header: CONTENT_HEADER, actions: contentActions });

  return (
    <Box sx={{ width: "100%", p: { xs: 1.5, sm: 2.5 } }}>
      {/* Collapsible filter card — same pattern as the Ledger: a "Filter by:"
          header row that toggles the Type + Status groups below it, and
          shows the active selections when collapsed. */}
      <Box
        sx={{
          width: "100%",
          mb: 1.5,
          border: "1px solid var(--border-medium)",
          borderRadius: 3,
          backgroundColor: "var(--card-bg)",
          px: { xs: 1.25, sm: 1.5 },
          py: { xs: 0.75, sm: 1 },
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-expanded={filtersOpen}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            background: "transparent",
            border: "none",
            p: 0,
            m: 0,
            cursor: "pointer",
            textAlign: "left",
            borderRadius: 1,
            "&:focus-visible": {
              outline: "2px solid var(--accent)",
              outlineOffset: 2,
            },
            "&:hover": {
              "& .filter-label": { color: "var(--text-primary)" },
              "& .filter-toggle": {
                color: "var(--text-primary)",
                backgroundColor: "var(--overlay-dark)",
              },
            },
          }}
        >
          <Typography
            className="filter-label"
            sx={{
              fontSize: "0.68rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontFamily: "'DM Sans', sans-serif",
              transition: "color 0.15s ease-out",
            }}
          >
            Filter by:
            {!filtersOpen && (typeFilter !== "all" || stateFilter !== "all") && (
              <Box
                component="span"
                sx={{ ml: 1, textTransform: "none", fontWeight: 500, color: "var(--accent)" }}
              >
                {typeFilter !== "all" &&
                  TYPE_FILTER_OPTIONS.find((o) => o.value === typeFilter)?.label}
                {typeFilter !== "all" && stateFilter !== "all" && " · "}
                {stateFilter !== "all" &&
                  STATE_FILTER_OPTIONS.find((o) => o.value === stateFilter)?.label}
              </Box>
            )}
          </Typography>
          <IconButton
            className="filter-toggle"
            size="small"
            tabIndex={-1}
            sx={{
              pointerEvents: "none",
              color: "var(--text-muted)",
              transition: "color 0.15s ease-out, background-color 0.15s ease-out",
              "& svg": {
                fontSize: 18,
                transform: filtersOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s ease-out",
              },
            }}
          >
            <ChevronDownIcon />
          </IconButton>
        </Box>

        {filtersOpen && (
          <Stack
            direction="row"
            sx={{
              mt: 0.75,
              flexWrap: "wrap",
              alignItems: "center",
              rowGap: 0.75,
              columnGap: { xs: 1, sm: 2 },
            }}
          >
            <FilterCards
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              counts={typeCounts}
              label="Filter by type"
              title="Type"
            />
            <FilterCards
              value={stateFilter}
              onChange={setStateFilter}
              options={STATE_FILTER_OPTIONS}
              counts={stateCounts}
              label="Filter by status"
              title="Status"
            />
          </Stack>
        )}
      </Box>

      <Table
        columns={columns}
        rows={visibleRows}
        loading={loading}
        rowKey="nAccountId"
        searchPlaceholder="Search by name, institution..."
        searchFields={["strName", "strInstitution"]}
      />

      {/* Tooltip-style popover on the Actions status button. */}
      <Popover
        open={Boolean(statusAnchor) && Boolean(statusRow)}
        anchorEl={statusAnchor}
        onClose={handleCloseStatus}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 150,
              p: 0.5,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              backgroundColor: "var(--card-bg)",
            },
          },
        }}
      >
        {statusRow &&
          STATE_FILTER_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => {
            const meta = STATE_META[opt.value];
            const isCurrent =
              opt.value === (statusRow.bIsActive !== false ? "active" : "inactive");
            return (
              <ListItemButton
                key={opt.value}
                dense
                selected={isCurrent}
                onClick={() => handleStatusChange(statusRow, opt.value)}
                sx={{ borderRadius: 1.5, gap: 1 }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: meta.color, flexShrink: 0 }}
                />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {opt.label}
                </Typography>
                {isCurrent && <CheckIcon sx={{ fontSize: 16, color: "var(--text-muted)" }} />}
              </ListItemButton>
            );
          })}
      </Popover>

      <AccountsAEModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveAccount}
        editingAccount={editingAccount}
        formData={formData}
        onChange={handleFieldChange}
        saving={saving}
      />

      <ViewLedgerEntriesModal
        open={Boolean(viewAccount)}
        onClose={() => setViewAccount(null)}
        account={viewAccount}
        /* Any change inside the modal (status / pay / unpay) refreshes
           the table behind it so balances stay in sync. */
        onDataChange={fetchAccounts}
      />

      {/* Ledger Add modal, preset to a transfer from the chosen account. */}
      <LedgerAEModal
        open={transferOpen}
        onClose={handleCloseTransfer}
        onSave={handleSaveTransfer}
        editingEntry={null}
        formData={transferForm || {}}
        onChange={(name, value) =>
          setTransferForm((prev) => ({ ...prev, [name]: value }))
        }
        saving={saving}
        accounts={accounts}
      />

      {toastNode}
    </Box>
  );
}
