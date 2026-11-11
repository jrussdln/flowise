import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth.js";
import Logo from "../../../components/ui/Logo.jsx";
import AppLoader from "../../../components/ui/AppLoader.jsx";
import { SITE } from "../../../constants/site.js";

/**
 * Sample sign-in page (login/logout only — no registration flow).
 * On success it stores the user in AuthContext and redirects to the
 * dashboard; if a session already exists it bounces straight there.
 */
export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [strUserName, setStrUserName] = useState("");
  const [strPassword, setStrPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <AppLoader label="Checking your session…" />;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormError("");
    setErrors({});

    const next = {};
    if (!strUserName.trim()) next.strUserName = "Username is required.";
    if (!strPassword) next.strPassword = "Password is required.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await login(strUserName.trim(), strPassword);
      navigate("/", { replace: true });
    } catch (err) {
      setErrors(err.errors || {});
      setFormError(err.message || "Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  };

  const inputStyle = (hasError) => ({
    background: "var(--input-bg)",
    color: "var(--text-primary)",
    border: `1px solid ${hasError ? "#f44336" : "var(--input-border)"}`,
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(900px 480px at 50% -10%, var(--glass-bg), transparent), var(--bg-primary)",
      }}
    >
      <style>{`
        .login-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
        }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <main
        className="w-full max-w-md rounded-2xl border px-6 py-8 sm:px-8 sm:py-10"
        style={{
          background: "var(--glass-bg-strong)",
          borderColor: "var(--border-medium)",
          boxShadow: "var(--glass-shadow)",
          backdropFilter: "blur(14px)",
        }}
      >
        <header className="text-center">
          <Logo imgClassName="h-9" className="justify-center" />
          <h1 className="mt-5 text-2xl font-bold text-[var(--text-primary)]">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Sign in to continue to {SITE.name}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor: "rgba(244, 67, 54, 0.55)",
                background: "rgba(244, 67, 54, 0.1)",
                color: "#f44336",
              }}
            >
              {formError}
            </div>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Username
            </span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              autoFocus
              value={strUserName}
              onChange={(e) => setStrUserName(e.target.value)}
              placeholder="e.g. russdln"
              className="login-input w-full rounded-xl px-4 py-2.5 text-sm transition"
              style={inputStyle(errors.strUserName)}
            />
            {errors.strUserName && (
              <span className="mt-1 block text-xs text-[#f44336]">
                {errors.strUserName}
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Password
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={strPassword}
              onChange={(e) => setStrPassword(e.target.value)}
              placeholder="••••••••"
              className="login-input w-full rounded-xl px-4 py-2.5 text-sm transition"
              style={inputStyle(errors.strPassword)}
            />
            {errors.strPassword && (
              <span className="mt-1 block text-xs text-[#f44336]">
                {errors.strPassword}
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="login-btn w-full rounded-xl px-4 py-3 text-sm font-semibold transition"
            style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          No account yet? Contact your administrator to get started.
        </p>
      </main>
    </div>
  );
}
