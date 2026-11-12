import { useCallback, useState } from "react";
import { PageChromeContext } from "../hooks/usePageChrome";

/* Per-page chrome for the content card (PageLayout renders the bars).
   Pages publish header/footer/actions nodes via useContentChrome; the
   setter bails out when all fields are reference-equal so passing
   stable nodes doesn't cause render loops. */
export function PageChromeProvider({ children }) {
  const [chrome, setChromeState] = useState({ header: null, footer: null, actions: null });

  const setChrome = useCallback((next) => {
    setChromeState((prev) =>
      prev.header === next.header &&
      prev.footer === next.footer &&
      prev.actions === next.actions
        ? prev
        : next
    );
  }, []);

  return (
    <PageChromeContext.Provider
      value={{ header: chrome.header, footer: chrome.footer, actions: chrome.actions, setChrome }}
    >
      {children}
    </PageChromeContext.Provider>
  );
}
