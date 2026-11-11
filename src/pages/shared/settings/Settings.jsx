export default function Settings() {
  return (
    <section className="relative min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
      <div className="text-center">
         <h2 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>Settings</h2>
         <p className="text-[var(--text-muted)] text-lg">System configurations and user preferences.</p>
      </div>
    </section>
  );
}
