export const SITE = {
  name: "FloWise",
  initials: "FLW",
  role: "Enterprise Platform",
  tagline: "Streamlining users and dashboards.",
};

export const NAV_ITEMS = [
  { label: "Dashboard", path: "/" },
  { label: "Ledger", path: "/ledger" },
  { label: "Accounts", path: "/accounts" },
  { label: "Loans", path: "/loans" },
  { label: "Savings", path: "/savings" },
  // Admin-only: hidden for cType !== "A" (Header/Footer filter) and the
  // routes are wrapped in RequireAdmin (src/routes/AppRoute.jsx).
  { label: "Categories", path: "/categories", adminOnly: true },
  { label: "Users", path: "/users", adminOnly: true },
];

export const FOOTER = {
  blurb: "A modern, responsive, and robust FloWise application.",
  tagline: "Powered by React, Tailwind CSS & Vite",
};
