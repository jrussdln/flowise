import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { NAV_ITEMS } from "../../constants/site";
import { useAuth } from "../../hooks/useAuth";
import ThemeToggle from "../ui/ThemeToggle";
import AccountMenu from "../ui/AccountMenu";
import Logo from "../ui/Logo";
import { LOGOS } from "../../constants/logos";

export default function Header() {
  const [openNav, setOpenNav] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  /* Users tab (adminOnly) is only listed for cType "A" accounts. */
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.cType === "A");

  return (
    <>
      <style>{`
        .nav-link {
          position: relative;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 50%;
          width: 0;
          height: 1.5px;
          background: linear-gradient(90deg, var(--text-primary), var(--accent-gold));
          border-radius: 99px;
          transition: width 0.3s ease, left 0.3s ease;
        }
        .nav-link:hover::after,
        .nav-link.active::after {
          width: 100%;
          left: 0;
        }
      `}</style>

      <header
        className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-6xl z-[100] transition-all duration-300 ease-out rounded-2xl border border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md shadow-lg"
      >
        <div className="relative px-4 sm:px-6">
          <div className="flex items-center justify-between h-[64px] lg:h-[72px]">
            {/* BRANDING */}
            <div className="flex-shrink-0 flex items-center mr-4">
              <Link
                to="/"
                aria-label="Go to dashboard"
                onClick={() => setOpenNav(false)}
                className="group relative flex items-center gap-2 sm:gap-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-lg p-1"
              >
                <Logo
                  src={LOGOS.rectangle}
                  mobileSrc={LOGOS.square}
                  imgClassName="h-7 sm:h-8"
                  className="transition-transform duration-300 group-hover:scale-[1.02]"
                />
                {/* Wordmark beside the logo — three left-aligned lines. */}
                <span className="hidden sm:flex flex-col justify-center leading-none text-left">
                  <span className="text-[0.7rem] font-medium text-[var(--text-primary)]">
                    BUDGET
                  </span>
                  <span className="text-[0.7rem] font-medium text-[var(--text-primary)]">
                    MANAGEMENT
                  </span>
                  <span className="text-[0.7rem] font-medium text-[var(--text-primary)]">
                    SYSTEM
                  </span>
                </span>
              </Link>
            </div>

            {/* DESKTOP NAV */}
            <nav className="hidden lg:flex items-center justify-end gap-1 xl:gap-2 ml-auto overflow-x-auto h-full scrollbar-hide py-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    className={`nav-link px-3 py-2 text-[0.88rem] tracking-wide font-medium transition-colors duration-200 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-md ${
                      isActive
                        ? "nav-link active text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* ACTION BUTTONS */}
            <div className="hidden lg:flex items-center gap-3 ml-4">
              <ThemeToggle />
              <AccountMenu />
            </div>

            {/* MOBILE: ACTION BUTTONS + HAMBURGER */}
            <div className="lg:hidden flex items-center gap-2">
              <ThemeToggle />
              <AccountMenu />
              <button
                onClick={() => setOpenNav(!openNav)}
                aria-label="Toggle menu"
                aria-expanded={openNav}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--overlay-dark)] transition-colors duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  {openNav ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE MENU */}
        <div
          className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            openNav ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="border-t border-[var(--border-light)] bg-transparent">
            <div className="flex flex-col py-2">
              {navItems.map((item, i) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    onClick={() => setOpenNav(false)}
                    className={`text-left px-6 py-3 text-sm transition-all duration-200 ${
                      isActive
                        ? "text-[var(--accent)] font-semibold bg-[var(--overlay-dark)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--overlay-dark)]"
                    }`}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      transitionDelay: openNav ? `${i * 40}ms` : "0ms",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
