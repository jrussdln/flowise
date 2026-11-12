/* ViewLoanLedgerEntries — viewer for a loan's Ledger entries (opened
   via the 👁 View button on ACTIVE loans). Mirrors the credit-card
   viewer: same statement tabs (Billed / Unbilled / Paid / Pending /
   Void), same entry rows (loan-icon circle with status dot, amount
   block, actions on the right), and the same PAY/UNPAID flow — PAY
   opens an inline "pay using" chooser that inserts a real Payment
   (PAY) entry on the chosen account. */

import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import {
  HandshakeOutlined as LoanIcon,
  ReceiptLongOutlined as ReceiptIcon,
  VisibilityOutlined as ViewIcon,
  PriceCheckOutlined as PaidIcon,
} from "@mui/icons-material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import { ledgerService } from "../../../../../services/ledgerService";
import { accountService } from "../../../../../services/accountService";
import { accountBalance, ensureCategory, loanSchedule, useToast } from "../../shared";

const prettyDate = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";

const peso = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_META = {
  PENDING: { label: "Pending", color: "#d97706" },
  POSTED: { label: "Posted", color: "#2e7d32" },
  VOID: { label: "Void", color: "var(--text-muted)" },
};

/* Loan-icon circle color (matches the Loan type on the Ledger page). */
const LOAN_COLOR = "#e65100";

const isThisMonth = (value) => {
  if (!value) return false;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

/* Due date has passed (before today) — payments the user missed. */
const isOverdue = (value) => {
  if (!value) return false;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
};

/* Same tab rules as the credit-card viewer: Paid = flagged paid,
   Overdue = unpaid and past due, Billed = unpaid charges due this
   month (not overdue), Unbilled = unpaid charges from other months
   (not overdue). (No Pending/Void tabs — loan entries are posted
   straight away and managed from the Loans page.) */
const matchTab = (row, tab) => {
  switch (tab) {
    case "paid":
      return row.bIsPaid === true;
    case "overdue":
      return row.bIsPaid !== true && isOverdue(row.dTransactionDate);
    case "billed":
      return (
        row.bIsPaid !== true &&
        isThisMonth(row.dTransactionDate) &&
        !isOverdue(row.dTransactionDate)
      );
    case "unbilled":
      return (
        row.bIsPaid !== true &&
        !isThisMonth(row.dTransactionDate) &&
        !isOverdue(row.dTransactionDate)
      );
    default:
      return true;
  }
};

export default function ViewLoanLedgerEntries({ open, onClose, loan, onDataChange }) {
  const [entries, setEntries] = useState([]);
  const [paySources, setPaySources] = useState([]);
  const [loading, setLoading] = useState(false);
  /* The entry whose inline "PAY USING" chooser is open (null = closed). */
  const [payEntryId, setPayEntryId] = useState(null);
  const [entriesTab, setEntriesTab] = useState("billed");
  const { showToast, toastNode } = useToast();
  const navigate = useNavigate();

  const fetchEntries = useCallback(async () => {
    if (!loan) return;
    setLoading(true);
    try {
      const [rows, accountRows] = await Promise.all([
        ledgerService.list(),
        accountService.list().catch(() => []),
      ]);
      const linked = (rows || []).filter((e) => e.nLoanId === loan.nLoanId);
      setEntries(linked);
      /* Payment sources: any non-credit-card account, with its live
         balance (computed from the same entries) for the
         insufficient-funds check. */
      setPaySources(
        (accountRows || [])
          .filter((a) => a.cAccountType !== "CREDIT")
          .map((a) => ({ ...a, dBalance: accountBalance(a, rows || []) }))
      );
    } catch (err) {
      console.error("Error fetching loan entries:", err);
      showToast(err.message || "Failed to load loan entries", "error");
    } finally {
      setLoading(false);
    }
  }, [loan, showToast]);

  /* Load this loan's entries each time the modal opens (and reset
     the statement tab back to Billed). */
  React.useEffect(() => {
    if (open && loan) {
      setEntriesTab("billed");
      fetchEntries();
    }
  }, [open, loan, fetchEntries]);

  /* Paid/Unpaid toggle. Clicking PAY opens the inline "pay using"
     chooser; clicking UNPAID immediately marks the entry unpaid and
     deletes the payment entry that was created for it (matched by
     Reference = the entry's ledger id). */
  const handlePayClick = (entry) => {
    if (entry.bIsPaid) {
      handleSetPaid(entry, false, null);
    } else {
      setPayEntryId((prev) => (prev === entry.nLedgerId ? null : entry.nLedgerId));
    }
  };

  /* Marking paid ALSO inserts a real Payment (PAY) ledger entry on the
     source account for the entry total (amount + fee) — so the money
     actually leaves the paying account. */
  const handleSetPaid = async (entry, paid, source) => {
    setPayEntryId(null);
    try {
      if (paid && source) {
        /* Insufficient funds: the payment can't exceed the source
           account's balance. */
        const total = Number(entry.dAmount || 0) + Number(entry.dFee || 0);
        const balance = Number(source.dBalance ?? 0);
        if (total > balance) {
          showToast(
            `Payment (₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}) exceeds ${source.strName}'s balance (₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}).`,
            "warning"
          );
          return;
        }
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
          now.getDate()
        ).padStart(2, "0")}`;
        /* Loan payments get the "Loan Payment" category and the lender
           as Merchant (mirrors the "Loan Proceeds" charge entries). */
        const categoryId = await ensureCategory("Loan Payment");
        await ledgerService.create({
          strTitle: `${loan.strName} Payment`,
          cType: "PAY",
          dAmount: total,
          dFee: 0,
          dTransactionDate: today,
          nAccountId: source.nAccountId,
          nCategoryId: categoryId,
          strMerchant: loan.strLender || null,
          strReference: String(entry.nLedgerId),
          cStatus: "POSTED",
        });
      }
      if (!paid) {
        const all = await ledgerService.list();
        const linked = (all || []).find(
          (e) => e.cType === "PAY" && e.strReference === String(entry.nLedgerId)
        );
        if (linked) await ledgerService.remove(linked.nLedgerId);
      }
      await ledgerService.update(entry.nLedgerId, { bIsPaid: paid });
      showToast(paid ? `Paid using ${source.strName} — payment recorded!` : "Marked as unpaid.");
      await fetchEntries();
      /* Let the Loans page re-sync (its Delete button tracks whether
         this loan has any paid entries). */
      onDataChange?.();
    } catch (err) {
      console.error("Paid toggle error:", err);
      showToast(err.message || "Failed to update payment state", "error");
    }
  };

  /* "View" opens the entry where it lives — the Ledger page, with the
     Loan type filter preselected (?type=LN) so the entry is visible. */
  const handleViewInLedger = () => {
    onClose();
    navigate("/ledger?type=LN");
  };

  const rows = entries;

  /* Tab-aware list + per-tab counts. */
  const visibleEntries = rows.filter((r) => matchTab(r, entriesTab));
  const tabCounts = {
    paid: rows.filter((r) => matchTab(r, "paid")).length,
    billed: rows.filter((r) => matchTab(r, "billed")).length,
    unbilled: rows.filter((r) => matchTab(r, "unbilled")).length,
    overdue: rows.filter((r) => matchTab(r, "overdue")).length,
  };

  const schedule = loan ? loanSchedule(loan) : null;
  const monthlyAmount = schedule?.[0]?.amount ?? null;

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={`Ledger Entries — ${loan?.strName || "Loan"}`}
      subtitle={loan ? `${loan.strLender || "Loan"} · ${rows.length} entr${rows.length === 1 ? "y" : "ies"}` : undefined}
      type="view"
      maxWidth="sm"
    >
      {loan && (
        /* Horizontal loan summary card (same layout as the credit
           card's balance card). */
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            p: 1.25,
            border: "1px solid var(--border-light)",
            borderRadius: 2,
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `color-mix(in srgb, ${LOAN_COLOR} 14%, transparent)`,
              color: LOAN_COLOR,
              "& svg": { fontSize: 18 },
            }}
          >
            <LoanIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                color: "var(--text-primary)",
                fontWeight: 600,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {loan.strName || "—"}
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
              {[
                loan.strLender,
                loan.nTermMonths ? `${loan.nTermMonths} months` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
            <Typography variant="caption" sx={{ display: "block", color: "var(--text-muted)", lineHeight: 1.2 }}>
              Per month
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap" }}>
              {peso(monthlyAmount)}
            </Typography>
          </Box>
        </Stack>
      )}

      {/* Statement tabs — same set as the credit-card viewer. */}
      {rows.length > 0 && (
        <Tabs
          value={entriesTab}
          onChange={(_, next) => setEntriesTab(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mb: 1,
            minHeight: 30,
            "& .MuiTab-root": {
              minHeight: 30,
              px: 1.25,
              fontSize: "0.68rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--text-muted)",
            },
            "& .MuiTab-root.Mui-selected": { color: "var(--accent)" },
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)", height: 2 },
          }}
        >
          <Tab value="billed" label={`Billed (${tabCounts.billed})`} />
          <Tab value="unbilled" label={`Unbilled (${tabCounts.unbilled})`} />
          <Tab value="overdue" label={`Overdue (${tabCounts.overdue})`} />
          <Tab value="paid" label={`Paid (${tabCounts.paid})`} />
        </Tabs>
      )}

      {loading ? (
        <Typography variant="body2" sx={{ color: "var(--text-muted)", py: 2 }}>
          Loading entries…
        </Typography>
      ) : rows.length === 0 ? (
        /* Dashed empty-state card (same language as the other viewers). */
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            py: 4,
            px: 2,
            border: "1.5px dashed var(--border-medium)",
            borderRadius: 3,
            textAlign: "center",
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "color-mix(in srgb, var(--text-muted) 12%, transparent)",
              color: "var(--text-muted)",
              "& svg": { fontSize: 20 },
            }}
          >
            <ReceiptIcon />
          </Box>
          <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
            No ledger entries for this loan yet.
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Entries are posted here when the loan is set to Active.
          </Typography>
        </Box>
      ) : visibleEntries.length === 0 ? (
        /* A tab is active but has nothing in it. */
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.75,
            py: 3,
            px: 2,
            border: "1.5px dashed var(--border-medium)",
            borderRadius: 3,
            textAlign: "center",
          }}
        >
          <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
            No {entriesTab} entries.
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            {entriesTab === "billed" && "Billed = unpaid payments due this month."}
            {entriesTab === "unbilled" && "Unbilled = unpaid payments from other months."}
            {entriesTab === "overdue" && "Overdue = unpaid payments past their due date."}
            {entriesTab === "paid" && "Payments you've marked as paid."}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {visibleEntries.map((row) => {
            const status = STATUS_META[row.cStatus] || {
              label: row.cStatus,
              color: "var(--text-muted)",
            };
            return (
              <React.Fragment key={row.nLedgerId}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    p: 1,
                    border: "1px solid var(--border-light)",
                    borderRadius: 2,
                    backgroundColor: "var(--bg-secondary)",
                  }}
                >
                  {/* Loan-icon circle with the status dot pinned on
                      its upper-right edge. */}
                  <Tooltip title={`Status: ${status.label}`} arrow>
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
                        backgroundColor: `color-mix(in srgb, ${LOAN_COLOR} 14%, transparent)`,
                        color: LOAN_COLOR,
                        "& svg": { fontSize: 16 },
                      }}
                    >
                      <LoanIcon />
                      <Box
                        aria-hidden
                        sx={{
                          position: "absolute",
                          top: -2,
                          right: -2,
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: status.color,
                          border: "1.5px solid var(--card-bg)",
                        }}
                      />
                    </Box>
                  </Tooltip>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.strTitle || "—"}
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
                      Due {prettyDate(row.dTransactionDate)}
                    </Typography>
                  </Box>

                  {/* Amount + fee (same size), then the larger total
                      (amount + fee) — same block as the credit viewer. */}
                  <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: LOAN_COLOR,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                        fontSize: "0.65rem",
                      }}
                    >
                      −{peso(row.dAmount)}
                    </Typography>
                    {Number(row.dFee) > 0 && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          lineHeight: 1.2,
                          fontSize: "0.65rem",
                        }}
                      >
                        + {peso(row.dFee)} fee
                      </Typography>
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        color: LOAN_COLOR,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                        fontSize: "0.75rem",
                      }}
                    >
                      −{peso(Number(row.dAmount || 0) + Number(row.dFee || 0))}
                    </Typography>
                  </Box>

                  {/* Actions on the right: View + Pay/Unpaid — same
                      cluster as the credit-card viewer. */}
                  <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                    <Tooltip title="View in Ledger" arrow>
                      <IconButton
                        size="small"
                        aria-label={`View ${row.strTitle || "entry"} in Ledger`}
                        onClick={handleViewInLedger}
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
                    {/* Pay/Unpaid toggle — never on a voided entry.
                        The label is the ACTION: "Pay" when unpaid,
                        "Unpaid" to undo. */}
                    {row.cStatus !== "VOID" && (
                      <Tooltip
                        title={row.bIsPaid ? "Mark as unpaid" : "Mark as paid"}
                        arrow
                      >
                        <Button
                          size="small"
                          aria-label={`${row.bIsPaid ? "Mark unpaid" : "Pay"}: ${row.strTitle || "entry"}`}
                          onClick={() => handlePayClick(row)}
                          startIcon={<PaidIcon />}
                          sx={{
                            height: 26,
                            minHeight: 26,
                            px: 0.75,
                            borderRadius: 1.5,
                            color: row.bIsPaid ? "var(--text-muted)" : "#2e7d32",
                            backgroundColor: `color-mix(in srgb, ${
                              row.bIsPaid ? "var(--text-muted)" : "#2e7d32"
                            } 12%, transparent)`,
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                            whiteSpace: "nowrap",
                            "& .MuiButton-startIcon": { mr: 0 },
                            "& svg": { fontSize: 13 },
                            "&:hover": {
                              backgroundColor: `color-mix(in srgb, ${
                                row.bIsPaid ? "var(--text-muted)" : "#2e7d32"
                              } 22%, transparent)`,
                            },
                          }}
                        >
                          {row.bIsPaid ? "Unpaid" : "Pay"}
                        </Button>
                      </Tooltip>
                    )}
                  </Stack>
                </Box>

                {/* Inline "PAY USING" chooser — opens under the row whose
                    PAY button was clicked, listing non-credit accounts. */}
                {payEntryId === row.nLedgerId && (
                  <Box
                    sx={{
                      ml: 3,
                      p: 1.25,
                      border: "1px dashed var(--border-medium)",
                      borderRadius: 2,
                      backgroundColor: "var(--card-bg)",
                    }}
                  >
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
                      Pay using:
                    </Typography>
                    {paySources.length === 0 ? (
                      <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                        No cash/bank accounts to pay from — create one on the Accounts page.
                      </Typography>
                    ) : (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 0.75,
                          alignItems: "center",
                        }}
                      >
                        {paySources.map((source) => (
                          <Button
                            key={source.nAccountId}
                            size="small"
                            onClick={() => handleSetPaid(row, true, source)}
                            sx={{
                              height: 26,
                              minHeight: 26,
                              px: 1,
                              borderRadius: 1.5,
                              border: "1px solid var(--border-medium)",
                              color: "var(--text-primary)",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              textTransform: "none",
                              whiteSpace: "nowrap",
                              "&:hover": {
                                borderColor: "#2e7d32",
                                color: "#2e7d32",
                                backgroundColor: "color-mix(in srgb, #2e7d32 10%, transparent)",
                              },
                            }}
                          >
                            {source.strName}
                            {source.strInstitution ? `(${source.strInstitution})` : ""}
                            {source.strLast4 ? ` ••••${source.strLast4}` : ""}
                            {source.dBalance != null && !Number.isNaN(Number(source.dBalance))
                              ? ` (₱${Number(source.dBalance).toLocaleString("en-PH", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })})`
                              : ""}
                          </Button>
                        ))}
                      </Box>
                    )}
                  </Box>
                )}
              </React.Fragment>
            );
          })}
        </Stack>
      )}

      {toastNode}
    </ModalComponent>
  );
}
