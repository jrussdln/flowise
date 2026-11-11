export const SITE = {
  name: "Budget Management System",
  initials: "BMS",
  role: "Enterprise Platform",
  tagline: "Streamlining budgets, savings, and loans.",
};

export const NAV_ITEMS = [
  { label: "Dashboard", path: "/" },
  { label: "Transactions", path: "/income-expense" },
  { label: "Loans", path: "/loans" },
  { label: "Cards", path: "/cards" },
  { label: "Savings", path: "/savings" },
  { label: "Settings", path: "/settings" },
  // Admin-only: hidden for cType !== "A" (Header/Footer filter) and the
  // route is wrapped in RequireAdmin (src/routes/AppRoute.jsx).
  { label: "Users", path: "/users", adminOnly: true },
];

export const FOOTER = {
  blurb: "A modern, responsive, and robust Budget Management System built to track income, expenses, savings, and loans in one place.",
  tagline: "Powered by React, Tailwind CSS & Vite",
};