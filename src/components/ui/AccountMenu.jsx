import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../../hooks/useAuth.js";

const menuItemSx = {
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  "&:hover": { backgroundColor: "var(--overlay-dark)" },
};

/**
 * Avatar button shown in the header, to the right of the theme toggle.
 * The "image" is the user's initials (first letter of first name + first
 * letter of last name, e.g. "JD"); clicking opens a menu with Logout.
 */
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);

  if (!user) return null;

  const first = (user.strFName || "").trim().charAt(0);
  const last = (user.strLName || "").trim().charAt(0);
  const initials = (first + last).toUpperCase() || "?";
  const fullName = `${user.strFName || ""} ${user.strLName || ""}`.trim();
  const open = Boolean(anchorEl);

  const goLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <IconButton
        id="account-menu-button"
        aria-label={fullName ? `Account menu for ${fullName}` : "Account menu"}
        aria-controls={open ? "account-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={{
          p: 0,
          width: 36,
          height: 36,
          "&:hover": { backgroundColor: "var(--overlay-dark)" },
        }}
      >
        <Avatar
          sx={{
            width: 34,
            height: 34,
            bgcolor: "var(--accent)",
            color: "var(--bg-primary)",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "1px solid var(--border-light)",
          }}
        >
          {initials}
        </Avatar>
      </IconButton>

      <Menu
        id="account-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        onClick={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              minWidth: 230,
              borderRadius: 2,
              border: "1px solid var(--border-medium)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              boxShadow: "var(--glass-shadow)",
            },
          },
        }}
      >
        <div className="px-4 py-3 border-b border-[var(--border-light)]">
          <Typography
            variant="subtitle2"
            sx={{ color: "var(--text-primary)", fontWeight: 600 }}
          >
            {fullName || user.strUserName}
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
            @{user.strUserName}
            {user.strEmail ? ` · ${user.strEmail}` : ""}
          </Typography>
        </div>

        <MenuItem onClick={goLogout} sx={menuItemSx}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" sx={{ color: "var(--text-muted)" }} />
          </ListItemIcon>
          <ListItemText>Logout</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
