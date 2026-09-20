import { useContext, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { BrowserStateScope, readBrowserState } from "../browser-state";

// BrowserRouter changes pages without loading a new document, so the browser's
// normal "new page starts at the top" behaviour never gets a chance to run.
// Keep one position per history entry: new navigation starts at the top, while
// Back and Forward return to the position where that entry was left.
const RouteScrollManager = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const scope = useContext(BrowserStateScope);
  const storageKey = `navigation:${scope}:scroll`;
  const savedPositions = useRef(readBrowserState<Record<string, number>>(sessionStorage, storageKey, {},
    (value): value is Record<string, number> => value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length <= 100 && Object.values(value).every(top => typeof top === "number" && Number.isFinite(top) && top >= 0)));
  const positions = useRef(new Map<string, number>());
  const previousKey = useRef(location.key);
  const previousUrl = useRef(location.pathname + location.search);
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
    savedPositions.current[previousUrl.current] = leavingTop;
    // Keep typing in a search field from scrolling that field out from under
    // the user. Opening a different page still starts at the top.
    const nextTop = navigationType === "REPLACE" && previousPath.current === location.pathname ? window.scrollY
      : location.state?.resumeActivity ? savedPositions.current[location.pathname + location.search] ?? 0
      : navigationType === "POP"
      ? positions.current.get(location.key) ?? 0
      : 0;

    previousKey.current = location.key;
    previousUrl.current = location.pathname + location.search;
    previousPath.current = location.pathname;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(savedPositions.current).slice(-100))));
    } catch { /* The in-memory history still works. */ }
    // Bootstrap enables smooth scrolling on the document. "auto" inherits it
    // and briefly shows a new page halfway down before sliding to its destination.
    window.scrollTo({ top: nextTop, behavior: "instant" });
  }, [location, navigationType, savedPositions, storageKey]);

  return null;
};

export default RouteScrollManager;
