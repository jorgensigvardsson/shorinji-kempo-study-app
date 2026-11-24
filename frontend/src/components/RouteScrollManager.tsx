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
  const previousPath = useRef(location.pathname);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    const previousSetting = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const rememberScroll = () => positions.current.set(previousKey.current, window.scrollY);
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      window.history.scrollRestoration = previousSetting;
      window.removeEventListener("scroll", rememberScroll);
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

    const leavingTop = positions.current.get(previousKey.current) ?? window.scrollY;
    positions.current.set(previousKey.current, leavingTop);
    // Keep typing in a search field from scrolling that field out from under
    // the user. Opening a different page still starts at the top.
    const nextTop = navigationType === "REPLACE" && previousPath.current === location.pathname ? window.scrollY
      : navigationType === "POP"
      ? positions.current.get(location.key) ?? 0
      : 0;

    previousKey.current = location.key;
    previousPath.current = location.pathname;
    // Bootstrap enables smooth scrolling on the document. "auto" inherits it
    // and briefly shows a new page halfway down before sliding to its destination.
    window.scrollTo({ top: nextTop, behavior: "instant" });
  }, [location, navigationType]);

  return null;
};

export default RouteScrollManager;
