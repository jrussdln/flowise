import { SITE } from "../../constants/site";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="w-full border-t border-[var(--footer-border)] glass-strong py-3 px-4 sm:px-6"
      style={{ boxShadow: "0 -1px 16px var(--shadow-color), inset 0 1px 0 var(--glass-edge)" }}
    >
      <p className="max-w-7xl mx-auto text-center text-xs text-[var(--text-muted)] tracking-wide">
        &copy; {currentYear} {SITE.name}. All rights reserved.
      </p>
    </footer>
  );
}
