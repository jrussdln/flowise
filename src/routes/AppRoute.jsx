import { Routes, Route, Navigate } from "react-router-dom";
import PageLayout from "../components/pageLayout/PageLayout";
import AppLoader from "../components/ui/AppLoader";
import Dashboard from "../pages/shared/overview/dashboard/Dashboard";
import Login from "../pages/auth/login/Login";
import Users from "../pages/admin/users/modals/Users";
import Categories from "../pages/admin/categories/modals/Categories";
import Ledger from "../pages/shared/finance/ledger/modals/Ledger";
import Accounts from "../pages/shared/finance/accounts/modals/Accounts";
import Loans from "../pages/shared/finance/loans/modals/Loans";
import Savings from "../pages/shared/finance/savings/modals/Savings";
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
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/savings" element={<Savings />} />
        <Route
          path="/categories"
          element={
            <RequireAdmin>
              <Categories />
            </RequireAdmin>
          }
        />
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