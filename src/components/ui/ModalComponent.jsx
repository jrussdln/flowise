import React from "react";
import { Box, Button, Dialog, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import Logo from "./Logo";

/**
 * Reusable modal built on MUI Dialog. On small screens it renders as a
 * bottom sheet — pinned to the bottom, up to ~55vh, rounded top
 * corners; from `sm` up it is a normal centered modal: one solid
 * rounded card with a header row (type icon + title + close ✕), a
 * scrollable body, and a labeled footer — Cancel and Save buttons
 * (plus any extra `actions`).
 *
 * Props:
 * - open: boolean — controls visibility
 * - onClose: () => void — close icon, Cancel, backdrop and Escape
 * - onCancel: () => void — optional: what ✕/Cancel does instead of
 *   onClose (e.g. a dialog with an inner form steps back to its list)
 * - type: "add" | "edit" | "delete" | "view" — header icon + Save colour
 * - title: string | ReactNode — header title
 * - subtitle: string | ReactNode — optional text under the title
 * - children: ReactNode — modal body content
 * - onSave: () => void — the labeled Save button; omit for read-only
 *   dialogs
 * - saveLabel: string — label of the Save button, default "Save"
 * - saving: boolean — shows a saving state and disables all buttons
 * - saveDisabled: boolean — disables just Save (e.g. a form whose
 *   chosen payment source cannot cover the amount yet)
 * - actions: ReactNode — optional extra labeled buttons in the footer,
 *   for dialogs that need more than save/close
 * - maxWidth: MUI breakpoint size, default "sm"
 * - fullWidth: boolean, default true
 * - disableClose: boolean — hides ✕/Cancel and disables backdrop/Escape
 *   close
 */

const TYPE_ICON = {
  add: AddCircleOutlineIcon,
  edit: EditOutlinedIcon,
  delete: DeleteOutlineIcon,
  view: VisibilityOutlinedIcon,
};

const TYPE_COLOR = {
  add: "#0284c7",
  edit: "#d97706",
  delete: "#dc2626",
  view: "#2563eb",
};

/* MUI breakpoint sizes in px, used to cap the centered dialog width
   from `sm` up (the `maxWidth` prop names a breakpoint). */
const DIALOG_MAX_WIDTH_PX = {
  xs: 444,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1920,
};

export default function ModalComponent({
  open,
  onClose,
  onCancel,
  type = "add",
  title,
  subtitle,
  children,
  onSave,
  saveLabel = "Save",
  saving = false,
  saveDisabled = false,
  actions,
  maxWidth = "sm",
  fullWidth = true,
  disableClose = false,
}) {  const handleClose = (_event, reason) => {
    if (disableClose) return;
    if (saving && (reason === "backdropClick" || reason === "escapeKeyDown")) return;
    onClose?.();
  };

  const TypeIcon = TYPE_ICON[type] ?? TYPE_ICON.add;
  const typeColor = TYPE_COLOR[type] ?? TYPE_COLOR.add;

  const handleCancel = () => (onCancel ? onCancel() : onClose?.());

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      /* On xs the modal becomes a bottom sheet: pinned to the bottom,
         up to ~half the screen, with rounded top corners. From sm up it
         stays a normal centered dialog. */
      sx={{
        "& .MuiDialog-container": {
          alignItems: { xs: "flex-end", sm: "center" },
        },
      }}
      slotProps={{
        paper: {
          sx: {
            borderRadius: { xs: "32px 32px 0 0", sm: 4 },
            border: "1px solid var(--border-light)",
            backgroundColor: "var(--card-bg)",
            backgroundImage: "none",
            margin: { xs: 0, sm: "auto" },
            width: "100%",
            /* Bottom sheet spans the screen below sm; from sm up the
               card is centered and capped by the `maxWidth` prop's pixel
               size (MUI breakpoint values). NOTE: `xs` in sx is the base
               style, so the sm+ entry is what keeps the dialog from
               expanding to the page width. */
            maxWidth: {
              xs: "100%",
              sm: `min(${DIALOG_MAX_WIDTH_PX[maxWidth] ?? 600}px, 100%)`,
            },
            maxHeight: { xs: "70vh", sm: "calc(100% - 64px)" },
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        },
        backdrop: {
          sx: {
            backgroundColor: "rgba(10, 22, 40, 0.6)",
          },
        },
      }}
    >
      {/* DRAG HANDLE — the small pill centered at the top of the bottom
          sheet (xs only; the centered dialog has no use for it) */}
      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          justifyContent: "center",
          pt: 1.25,
        }}
      >
        <Box
          sx={{
            width: 44,
            height: 4,
            borderRadius: 999,
            backgroundColor: "var(--border-medium)",
          }}
        />
      </Box>

      {/* HEADER — type icon, title/subtitle, close ✕ on the right */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <TypeIcon sx={{ fontSize: 22, color: typeColor, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              sx={{
                color: "var(--text-muted)",
                fontWeight: 300,
                fontStyle: "italic",
                display: "block",
                mt: -0.25,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {!disableClose && (
          <IconButton
            aria-label="close"
            onClick={handleCancel}
            disabled={saving}
            size="small"
            sx={{ color: "var(--text-muted)", flexShrink: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* BODY — scrolls on its own when the content is tall. On xs it
          fills the bottom sheet (paper caps at 55vh); on sm+ it keeps
          its own height cap so the card stays centered and compact. */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2.5,
          color: "var(--text-secondary)",
          flex: { xs: 1, sm: "0 1 auto" },
          minHeight: 0,
          maxHeight: { xs: "none", sm: "min(60vh, 640px)" },
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </Box>

      {/* FOOTER — logo on the left, labeled buttons right-aligned */}
      {(actions || onSave || !disableClose) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            py: 2,
            borderTop: "1px solid var(--border-light)",
          }}
        >
          <Logo imgClassName="h-6" className="flex-shrink-0" />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {actions}
            {!disableClose && (
              <Button
                variant="text"
                onClick={handleCancel}
                disabled={saving}
                sx={{ textTransform: "none", fontWeight: 600, color: "var(--text-muted)" }}
              >
                Cancel
              </Button>
            )}
            {onSave && (
              <Button
                variant="contained"
                onClick={onSave}
                disabled={saving || saveDisabled}
                disableElevation
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  backgroundColor: typeColor,
                  "&:hover": { backgroundColor: typeColor, opacity: 0.9 },
                }}
              >
                {saving ? "Saving…" : saveLabel}
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
