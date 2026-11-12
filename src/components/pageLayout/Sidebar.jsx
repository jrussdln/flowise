import { Fragment } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "../../constants/site";
import { useAuth } from "../../hooks/useAuth";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";

/* Menu icons, keyed by route path (NAV_ITEMS stays plain data). */
const NAV_ICONS = {
  "/": SpaceDashboardOutlinedIcon,
  "/ledger": ReceiptLongOutlinedIcon,
  "/accounts": AccountBalanceOutlinedIcon,
  "/loans": RequestQuoteOutlinedIcon,
  "/savings": SavingsOutlinedIcon,
  "/categories": CategoryOutlinedIcon,
  "/users": GroupOutlinedIcon,
};

/* Floating navigation sidebar — a card under the header. Two states:
   expanded (icons + labels, 240px) and collapsed (icon-only mini rail,
   64px). PageLayout owns the state — default follows the breakpoint
   (rail below lg, full at lg+) and the footer toggle overrides it.
   On mobile there is no persistent sidebar: `offCanvas` slides the
   card out of view, and `overlay` marks the open drawer state (with
   `onCollapse` triggered by menu clicks). */
export default function Sidebar({
  expanded = false,
  overlay = false,
  offCanvas = false,
  onToggleCollapse,
  onCollapse,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  /* Users tab (adminOnly) is only listed for cType "A" accounts. */
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.cType === "A");

  const goLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  /* Shared pill chrome for full-width footer/nav buttons. Collapsed
     pills are tighter so the mini rail doesn't feel stretched out. */
  const itemClass = `w-full flex items-center ${
    expanded
      ? "justify-start gap-3 px-3 py-2.5"
      : "justify-center px-2.5 py-2"
  } rounded-xl text-[0.88rem] tracking-wide font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`;

  return (
    <aside
      /* Sits just under the floating header card: the header ends at
         16px + 64px (mobile/tablet) or 16px + 72px (lg), so the card
         starts 12px below that. All edge margins are 16px. */
      className={`fixed top-[92px] lg:top-[100px] left-4 bottom-4 ${
        expanded ? "w-60" : "w-16"
      } z-[95] overflow-hidden flex flex-col rounded-2xl border border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md ${
        overlay ? "shadow-2xl" : "shadow-lg"
      } transform transition-[width,transform] duration-300 ease-out ${
        offCanvas ? "-translate-x-[150%] pointer-events-none" : "translate-x-0"
      }`}
    >
      {/* NAV LINKS */}
      <nav
        className={`flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide ${
          expanded ? "px-3 py-4" : "px-2 py-3"
        }`}
      >
        <p
          className={`px-3 pb-2 text-[0.65rem] uppercase tracking-[0.08em] text-[var(--text-muted)] font-medium ${
            expanded ? "block" : "hidden"
          }`}
        >
          Menu
        </p>
        <ul
          className={`flex flex-col items-stretch ${
            expanded ? "gap-1" : "gap-0.5"
          }`}
        >
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            const Icon = NAV_ICONS[item.path];
            return (
              <Fragment key={item.label}>
                {/* Section label ahead of the admin-only group — shown
                    once, before the FIRST admin item (not per item). */}
                {item.adminOnly && navItems[index - 1]?.adminOnly !== true && (
                  <li className={expanded ? "pt-2" : "pt-1.5"}>
                    {expanded && (
                      <p className="px-3 pb-1 text-[0.65rem] uppercase tracking-[0.08em] text-[var(--text-muted)] font-medium">
                        Admin
                      </p>
                    )}
                  </li>
                )}
                <li className="w-full flex">
                  <Link
                    to={item.path}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => overlay && onCollapse?.()}
                    className={`${itemClass} ${
                      isActive
                        ? "bg-[var(--overlay-dark)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--overlay-dark)]"
                    }`}
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                    <span
                      className={`whitespace-nowrap ${expanded ? "block" : "hidden"}`}
                    >
                      {item.label}
                    </span>
                    {/* Active dot — meaningful only when labels show */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isActive && expanded ? "bg-[var(--accent)]" : "bg-transparent"
                      } ${expanded ? "block" : "hidden"}`}
                    />
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </nav>

      {/* BOTTOM — collapse/expand toggle above Logout, with a divider
          line separating it from the nav in both states. */}
      <div
        className={`flex-shrink-0 border-t border-[var(--border-light)] flex flex-col ${
          expanded ? "px-3 py-3 gap-1" : "px-2 py-2.5 gap-0.5"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title={expanded ? "Collapse" : "Expand"}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className={`${itemClass} text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--overlay-dark)]`}
        >
          {expanded ? (
            <>
              <ChevronLeftOutlinedIcon className="w-5 h-5 flex-shrink-0" />
              <span className="whitespace-nowrap">Collapse</span>
            </>
          ) : (
            <ChevronRightOutlinedIcon className="w-5 h-5 flex-shrink-0" />
          )}
        </button>
        {user && (
          <button
            type="button"
            onClick={goLogout}
            title="Logout"
            aria-label="Logout"
            className={`${itemClass} text-[var(--text-muted)] hover:text-[#f44336] hover:bg-[var(--overlay-dark)]`}
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <LogoutOutlinedIcon className="w-5 h-5 flex-shrink-0" />
            <span className={`whitespace-nowrap ${expanded ? "block" : "hidden"}`}>
              Logout
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
