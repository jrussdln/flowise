import { createContext, useContext, useEffect } from "react";

export const PageChromeContext = createContext(null);

export function usePageChrome() {
  const ctx = useContext(PageChromeContext);
  if (!ctx) throw new Error("usePageChrome must be used within PageChromeProvider");
  return ctx;
}

/* Pages call this to publish their content-card header/footer bars
   (rendered by PageLayout). `actions` is the right side of the header
   bar (e.g. a primary button). Pass stable nodes (e.g. module-level
   JSX or useMemo) so the effect doesn't re-fire on every render. */
export function useContentChrome({ header, footer, actions } = {}) {
  const { setChrome } = usePageChrome();
  useEffect(() => {
    setChrome({ header, footer, actions });
    return () => setChrome({ header: null, footer: null, actions: null });
  }, [header, footer, actions, setChrome]);
}
