import { useTheme } from "../../hooks/useTheme.js";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 flex-shrink-0"
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-pressed={theme === "dark"}
      style={{
        background: "var(--overlay-dark)",
        border: "1px solid var(--overlay-dark)",
        boxShadow: "0 2px 12px var(--shadow-color), 0 0 0 1px var(--shadow-hover) inset",
      }}
    >
      <span
        className="flex items-center justify-center w-full h-full transition-transform duration-300"
        style={{
          transform: theme === "light" ? "rotate(0deg) scale(1)" : "rotate(180deg) scale(1)",
          color: "var(--text-primary)",
        }}
      >
        {theme === "light" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4.5 h-4.5 sm:w-5 sm:h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4.5 h-4.5 sm:w-5 sm:h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        )}
      </span>
      <span
        className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest font-medium opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 whitespace-nowrap"
        style={{
          color: "var(--text-primary)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {theme === "light" ? "Dark Mode" : "Light Mode"}
      </span>
    </button>
  );
}