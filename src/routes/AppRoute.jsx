import { Routes, Route, Navigate } from "react-router-dom";
import PageLayout from "../components/pageLayout/PageLayout";
import AppLoader from "../components/ui/AppLoader";
import Dashboard from "../pages/shared/overview/dashboard/Dashboard";
import Transactions from "../pages/shared/transaction/Transactions";
import Loans from "../pages/shared/loans/Loans";
import Cards from "../pages/shared/cards/Cards";
import Login from "../pages/auth/login/Login";
import Savings from "../pages/shared/savings/Savings";
import Settings from "../pages/shared/settings/Settings";
import Users from "../pages/admin/users/Users";
import { useAuth } from "../hooks/useAuth";

/** Waits for the session, then shows the app or bounces to /login. */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <AppLoader label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Admin-only content (cType "A") — everyone else goes to the dashboard. */
function RequireAdmin({ children }) {
  const { user } = useAuth();

  if (user?.cType !== "A") return <Navigate to="/" replace />;
  return children;
}

export default function AppRoute() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <PageLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/income-expense" element={<Transactions />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <Users />
            </RequireAdmin>
          }
        />
      </Route>
    </Routes>
  );
}