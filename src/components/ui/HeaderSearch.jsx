import { useEffect, useRef, useState } from "react";
import { useSearch } from "../../hooks/useSearch";

/* Round search button in the header (sits before the theme toggle).
   Collapsed it is just the magnifier icon; clicking expands it into
   the search field. Escape — or blur while empty — collapses it. */
export default function HeaderSearch() {
  const { searchTerm, setSearchTerm, placeholder } = useSearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <div
      className={`flex items-center rounded-full transition-all duration-300 ease-out overflow-hidden flex-shrink-0 border shadow-md backdrop-blur-md ${
        open ? "w-[170px] sm:w-[240px]" : "w-9 sm:w-10"
      }`}
      style={{
        background: "var(--overlay-dark)",
        borderColor: "var(--overlay-dark)",
        boxShadow: "0 2px 12px var(--shadow-color), 0 0 0 1px var(--shadow-hover) inset",
      }}
    >
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close search" : "Open search"}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[var(--text-primary)] hover:scale-105 transition-transform duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4.5 h-4.5 sm:w-5 sm:h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          )}
        </svg>
      </button>

      {open && (
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          onBlur={() => !searchTerm && close()}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none border-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] pr-2"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        />
      )}
    </div>
  );
}
