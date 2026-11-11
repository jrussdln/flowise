/**
 * Full-screen spinner used while the auth session is being restored
 * (RequireAuth on protected routes and the /login page both wait on it).
 */
export default function AppLoader({ label = "Loading…" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]"
    >
      <span className="h-9 w-9 rounded-full border-2 border-[var(--border-medium)] border-t-[var(--accent)] animate-spin" />
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
