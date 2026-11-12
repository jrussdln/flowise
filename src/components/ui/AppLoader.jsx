import Logo from "./Logo";

/**
 * Full-screen loader used while the auth session is being restored
 * (RequireAuth on protected routes and the /login page both wait on
 * it). Just the bare app icon, pulsing and shining like a skeleton
 * placeholder — no card, no text.
 */
export default function AppLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]"
    >
      <div className="logo-skeleton">
        <Logo variant="icon" imgClassName="h-16 w-16" />
      </div>
    </div>
  );
}
