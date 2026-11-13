import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  HandshakeOutlined as LoanIcon,
  LinkOutlined as LinkIcon,
} from "@mui/icons-material";
import ModalComponent from "../../../../../components/ui/ModalComponent";
import { loanService } from "../../../../../services/loanService";
import { useToast } from "../../shared";

const peso = (value) =>
  value == null || Number.isNaN(Number(value))
    ? "—"
    : `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Chooser for connecting existing (unlinked) loans to a Loan-type
   account. Every loan shown has no Linked Account yet; linking one
   points its tblloans.nAccountId at this account and clears its
   Lender name (the account's Bank/Provider takes over that role). */
export default function LinkAccountToLoanModal({ open, onClose, account, onLinked }) {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const { showToast, toastNode } = useToast();

  const fetchLoans = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const all = await loanService.list();
      /* Only loans that aren't linked to any account yet. */
      setLoans((all || []).filter((l) => l.nAccountId == null));
    } catch (err) {
      console.error("Error loading loans:", err);
      showToast(err.message || "Failed to load loans", "error");
    } finally {
      setLoading(false);
    }
  }, [account, showToast]);

  /* Fresh list every time the modal opens. */
  useEffect(() => {
    if (open && account) fetchLoans();
  }, [open, account, fetchLoans]);

  const handleLink = async (loan) => {
    if (!account) return;
    setLinkingId(loan.nLoanId);
    try {
      await loanService.update(loan.nLoanId, {
        /* The link itself — tblloans.nAccountId references this
           account, which is what the Account viewer reads. */
        nAccountId: account.nAccountId,
        /* A Lender name is redundant once the account is attached —
           clear it so the two can't disagree. */
        ...(loan.strLender ? { strLender: null } : {}),
      });
      showToast(`"${loan.strName || "Loan"}" linked to ${account.strName || "account"}!`);
      await fetchLoans();
      onLinked?.();
    } catch (err) {
      console.error("Link error:", err);
      showToast(err.message || "Failed to link loan", "error");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <>
      <ModalComponent
        open={open}
        onClose={onClose}
        type="view"
        title={account ? `Link loans — ${account.strName}` : "Link loans"}
        subtitle={
          account
            ? `${account.strInstitution || "Loan account"} · pick a loan to connect`
            : undefined
        }
        maxWidth="sm"
      >
        {loading ? (
          <Typography variant="body2" sx={{ color: "var(--text-muted)", py: 2 }}>
            Loading loans…
          </Typography>
        ) : loans.length === 0 ? (
          /* Dashed empty state — same language as the other viewers. */
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
                backgroundColor: "color-mix(in srgb, #e65100 12%, transparent)",
                color: "#e65100",
                "& svg": { fontSize: 20 },
              }}
            >
              <LoanIcon />
            </Box>
            <Typography variant="body2" sx={{ color: "var(--text-muted)", fontWeight: 500 }}>
              No unlinked loans.
            </Typography>
            <Typography variant="caption" sx={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              Every loan already has a Linked Account. Unlink one on the Loans page, or leave the
              Linked Account field empty when creating a new loan.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {loans.map((loan) => (
              <Box
                key={loan.nLoanId}
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
                <Box
                  aria-hidden
                  sx={{
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "color-mix(in srgb, #e65100 14%, transparent)",
                    color: "#e65100",
                    "& svg": { fontSize: 16 },
                  }}
                >
                  <LoanIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
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
                      `Principal ${peso(loan.dPrincipal)}`,
                      loan.nTermMonths ? `${loan.nTermMonths} mo` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
                <Tooltip title={`Link "${loan.strName || "loan"}" to this account`} arrow>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={linkingId === loan.nLoanId}
                      startIcon={<LinkIcon />}
                      onClick={() => handleLink(loan)}
                      aria-label={`Link ${loan.strName || "loan"} to ${account?.strName || "account"}`}
                      sx={{
                        flexShrink: 0,
                        minHeight: 28,
                        px: 1,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "none",
                        borderRadius: 1.5,
                        color: "#2563eb",
                        borderColor: "color-mix(in srgb, #2563eb 40%, transparent)",
                        "& svg": { fontSize: 15 },
                        "&:hover": {
                          borderColor: "#2563eb",
                          backgroundColor: "color-mix(in srgb, #2563eb 10%, transparent)",
                        },
                      }}
                    >
                      Link
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            ))}
          </Stack>
        )}
      </ModalComponent>
      {toastNode}
    </>
  );
}
