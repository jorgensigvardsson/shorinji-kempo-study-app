import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// BrowserRouter changes pages without loading a new document, so the browser's
// normal "new page starts at the top" behaviour never gets a chance to run.
// Keep one position per history entry: new navigation starts at the top, while
// Back and Forward return to the position where that entry was left.
const RouteScrollManager = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previousKey = useRef(location.key);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const previousSetting = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousSetting;
    };
  }, []);

  useLayoutEffect(() => {
    // Leave the initial document position alone. This preserves a normal page
    // reload, while every in-app navigation below is managed explicitly.
    if (!initialized.current) {
      initialized.current = true;
      previousKey.current = location.key;
      return;
    }

    positions.current.set(previousKey.current, window.scrollY);
    const nextTop = navigationType === "POP"
      ? positions.current.get(location.key) ?? 0
      : 0;

    previousKey.current = location.key;
    window.scrollTo({ top: nextTop, behavior: "auto" });
  }, [location.key, navigationType]);

  return null;
};

export default RouteScrollManager;
