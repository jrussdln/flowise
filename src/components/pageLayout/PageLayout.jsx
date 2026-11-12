import { useState } from "react";
import { Outlet } from "react-router-dom";
import useMediaQuery from "@mui/material/useMediaQuery";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { usePageChrome } from "../../hooks/usePageChrome";

/* Shell of floating cards: full-width header card on top, sidebar card
   below it on the left, and the page content in its own floating card
   on the right. The content card starts under the header (12px gap
   below its bottom edge) and scrolls internally.

   Sidebar by device:
   - mobile (< md): no persistent sidebar — the header's menu icon
     opens it as an overlay drawer (dark backdrop, slides over the
     content, which never changes layout).
   - tablet (md–lg): persistent icon rail, expandable to push content.
   - desktop (lg+): full menu by default, collapsible to the rail.

   Optional chrome for the content card:
   - contentHeader / contentActions / contentFooter: nodes rendered as
     pinned bars in the content card (top-left / top-right / bottom). */
export default function PageLayout({ contentHeader, contentActions, contentFooter }) {
  /* Sidebar collapse: null means "follow the breakpoint" (rail below
     lg, full menu at lg+); true/false is the user's manual choice. On
     mobile the sidebar only exists while the drawer is open. */
  const isLg = useMediaQuery("(min-width: 1024px)");
  const isMd = useMediaQuery("(min-width: 768px)");
  const [collapsedOverride, setCollapsedOverride] = useState(null);
  const expanded = collapsedOverride === null ? isLg : !collapsedOverride;
  const overlay = expanded && !isMd; // mobile drawer mode
  const offCanvas = !isMd && !expanded; // mobile: sidebar slid out of view
  const toggleCollapse = () =>
    setCollapsedOverride((prev) => (prev === null ? !isLg : !prev));
  const collapse = () => setCollapsedOverride(true);

  /* Props win when given; otherwise the active page's published
     chrome (via useContentChrome) is used. */
  const { header: pageHeader, footer: pageFooter, actions: pageActions } = usePageChrome();
  const header = contentHeader ?? pageHeader;
  const actions = contentActions ?? pageActions;
  const footer = contentFooter ?? pageFooter;

  return (
    <div className="h-screen relative overflow-hidden" style={{ zIndex: 1 }}>
      {/* Dark backdrop while the drawer is open on mobile — clicking it
          collapses (closes) the sidebar. */}
      <div
        onClick={collapse}
        aria-hidden="true"
        className={`fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          overlay ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <Sidebar
        expanded={expanded}
        overlay={overlay}
        offCanvas={offCanvas}
        onToggleCollapse={toggleCollapse}
        onCollapse={collapse}
      />
      <Header onMenuClick={toggleCollapse} />
      <main
        /* Offsets: mobile has no sidebar (drawer overlays instead);
           md–lg rail = 64px; expanded full sidebar = 240px — plus the
           16px left margin + an 8px gap in each case. */
        className={`fixed top-[92px] lg:top-[100px] bottom-4 left-4 right-4 z-[10] ${
          expanded && isMd ? "ml-[248px]" : isMd ? "ml-[72px]" : "ml-0"
        } overflow-hidden flex flex-col rounded-2xl border border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-md shadow-lg transition-[margin] duration-300 ease-out`}
      >
        {/* Content header bar — pinned above the scrolling area.
            Title on the left, action buttons on the right. Compact
            spacing on mobile. */}
        {(header || actions) && (
          <div className="flex-shrink-0 px-3 sm:px-6 py-2 sm:py-3 border-b border-[var(--border-light)] flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            {header}
            {actions}
          </div>
        )}

        {/* Scrolling page content. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>

        {/* Content footer bar — pinned below the scrolling area. */}
        {footer && (
          <div className="flex-shrink-0 px-5 sm:px-6 py-3 border-t border-[var(--border-light)]">
            {footer}
          </div>
        )}
      </main>
    </div>
  );
}
