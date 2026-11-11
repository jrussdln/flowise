export default function Dashboard() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] pb-10">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap');
      `}</style>
      
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pt-16 overflow-hidden">
        <div className="relative w-full max-w-6xl mx-auto text-center">
          <h1
            className="uppercase text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-[#0f172a] lg:text-[var(--text-primary)] leading-[0.95]"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            <span className="block text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-medium leading-none mb-0 sm:mb-1 text-[#334155] lg:text-[var(--text-secondary)]">
              Welcome to the
            </span>
            <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl mt-2 text-[var(--accent)]">
              Budget Management System
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[var(--hero-tagline)] lg:text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Track income and expenses, grow your savings, and manage your loans — all in one centralized budget management platform.
          </p>
        </div>
      </section>
    </div>
  );
}
