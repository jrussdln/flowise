import React from "react";
import { Box, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";

/**
 * Reusable modal built on MUI Dialog, styled as detached rounded "bubble"
 * pieces: a standalone circular icon bubble on top (reflecting the modal
 * type), a title bubble, a content bubble, and a bottom row of standalone
 * circular buttons — ✕ to cancel/close and ✓ to save — instead of the old
 * labeled footer buttons.
 *
 * Props:
 * - open: boolean — controls visibility
 * - onClose: () => void — close icon, backdrop and Escape
 * - onCancel: () => void — optional: what ✕ does instead of onClose
 *   (e.g. a dialog with an inner form steps back to its list first)
 * - type: "add" | "edit" | "delete" | "view" — the icon bubble + ✓ colour
 * - title: string | ReactNode — header title (left-aligned in its bubble)
 * - subtitle: string | ReactNode — optional text beside the title
 * - children: ReactNode — modal body content
 * - onSave: () => void — the round ✓ button; omit for read-only dialogs
 * - saveLabel: string — tooltip of the ✓ button, default "Save"
 * - saving: boolean — shows a saving state and disables both buttons
 * - saveDisabled: boolean — disables just the ✓ (e.g. a form whose
 *   chosen payment source cannot cover the amount yet)
 * - actions: ReactNode — optional labeled buttons in a rounded pill next
 *   to the circles, for dialogs that need more than save/close
 * - maxWidth: MUI breakpoint size, default "sm"
 * - fullWidth: boolean, default true
 * - disableClose: boolean — hides ✕ and disables backdrop/Escape close
 */

/* Shared "bubble" styling — each detached piece is its own floating card. */
const bubbleSx = {
  borderRadius: "1rem",
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-light)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)",
};

/* The buttons in the bottom row are the same bubble, as a 40px circle. */
const circleSx = {
  ...bubbleSx,
  width: 40,
  height: 40,
  borderRadius: "50%",
};

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
}) {
  const handleClose = (_event, reason) => {
    if (disableClose) return;
    if (saving && (reason === "backdropClick" || reason === "escapeKeyDown")) return;
    onClose?.();
  };

  const TypeIcon = TYPE_ICON[type] ?? TYPE_ICON.add;
  const typeColor = TYPE_COLOR[type] ?? TYPE_COLOR.add;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 0,
            backgroundColor: "transparent",
            boxShadow: "none",
            backgroundImage: "none",
          },
        },
        backdrop: {
          sx: {
            backgroundColor: "rgba(10, 22, 40, 0.6)",
       
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          p: 1,
        }}
      >
        {/* Standalone circular type icon bubble — same style as the buttons below */}
        <Box
          sx={{
            ...circleSx,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <TypeIcon sx={{ fontSize: 18, color: typeColor }} />
        </Box>

        {/* Title / subtitle bubble — single compact row */}
        <Box
          sx={{
            ...bubbleSx,
            width: "fit-content",
            maxWidth: "100%",
            display: "flex",
            alignItems: "baseline",
            gap: 0.75,
            px: 1.5,
            py: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              fontSize: "0.75rem",
              minWidth: 0,
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
                whiteSpace: "nowrap",
                fontSize: "0.7rem",
                flexShrink: 0,
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Content bubble — body only, scrolling on its own when it is tall */}
        <Box
          sx={{
            ...bubbleSx,
            width: "100%",
            px: { xs: 2, sm: 3 },
            py: 2.5,
            color: "var(--text-secondary)",
            maxHeight: "min(60vh, 640px)",
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {children}
        </Box>

        {/* Bottom row — standalone ✕ / ✓ circles (+ optional labeled actions) */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          {!disableClose && (
            <Tooltip title="Close">
              <span>
                <IconButton
                  aria-label="close"
                  onClick={() => (onCancel ? onCancel() : onClose?.())}
                  disabled={saving}
                  size="small"
                  sx={{ ...circleSx, color: "var(--text-muted)" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}

          {actions && (
            <Box
              sx={{
                ...bubbleSx,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.75,
                py: 0.35,
                borderRadius: "999px",
              }}
            >
              {actions}
            </Box>
          )}

          {onSave && (
            <Tooltip title={saving ? "Saving…" : saveLabel}>
              <span>
                <IconButton
                  aria-label={saveLabel}
                  onClick={onSave}
                  disabled={saving || saveDisabled}
                  size="small"
                  sx={{ ...circleSx, color: typeColor }}
                >
                  <CheckIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
