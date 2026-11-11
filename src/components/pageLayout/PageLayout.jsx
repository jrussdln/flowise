import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
// Galaxy background disabled for now — uncomment to bring it back:
// import GalaxyBackground from '../ui/GalaxyBackground'


export default function PageLayout() {
  return (
    <>
     
      <div className="h-screen flex flex-col relative overflow-hidden" style={{ zIndex: 1 }}>
        {/* Page-wide blue nebula tint (fixed — stays put while scrolling) */}
        {/* Disabled for now:
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[-1] pointer-events-none"
          style={{
            background:
              "radial-gradient(45% 40% at 65% 45%, rgba(59, 130, 246, 0.14), transparent 70%), radial-gradient(35% 35% at 30% 60%, rgba(96, 165, 250, 0.10), transparent 70%)",
          }}
        />
        */}

        {/* Page-wide galaxy particles (fixed — unaffected by scrolling) */}
        {/* Disabled for now:
        <GalaxyBackground className="fixed inset-0 z-[-1] w-full h-full" />
        */}

        <Header />
        <main className="flex-1 overflow-y-auto pt-[90px] lg:pt-[84px]">
          <Outlet />
        </main>
        <Footer />
      </div>
    </>
  );
}