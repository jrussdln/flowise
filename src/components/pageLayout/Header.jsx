import { Link } from "react-router-dom";
import ThemeToggle from "../ui/ThemeToggle";
import HeaderSearch from "../ui/HeaderSearch";
import AccountMenu from "../ui/AccountMenu";
import Logo from "../ui/Logo";

/* Top bar: on mobile a menu icon (opens the sidebar drawer) on the far
   left, then branding; search, theme toggle and account menu on the
   right. On md+ the sidebar is persistent, so the menu icon hides. */
export default function Header({ onMenuClick }) {
  return (
    <header
      className="fixed top-4 left-4 right-4 z-[100] transition-all duration-300 ease-out rounded-2xl border border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md shadow-lg"
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-[64px] lg:h-[72px]">
          {/* BRANDING (+ mobile menu button) */}
          <div className="flex-shrink-0 flex items-center gap-1 sm:gap-2 mr-4">
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open menu"
              className="md:hidden p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--overlay-dark)] transition-colors duration-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link
              to="/"
              aria-label="Go to dashboard"
              className="group relative flex items-center gap-2 sm:gap-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-lg p-1"
            >
              <Logo imgClassName="h-7 sm:h-8" className="transition-transform duration-300 group-hover:scale-[1.02]" />
            </Link>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-2 sm:gap-3">
            <HeaderSearch />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
