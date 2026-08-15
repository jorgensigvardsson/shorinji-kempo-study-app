import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { TRAINING_ROOT } from "./training-routes";

// Training mode is the Dojo presentation plus the screen wake lock. It follows the
// user between training views, and turns itself off in the two situations where
// leaving it on would be wrong.
//
// It is deliberately session state and not persisted: coming back to the app should
// not silently hold the screen awake because of something switched on hours ago.

// The grading tool is reached from Träning but lives outside its path.
const isTrainingPath = (pathname: string): boolean =>
    pathname.startsWith(TRAINING_ROOT) || pathname === "/training/grading";

export function useTrainingMode(): [boolean, (active: boolean) => void] {
    const location = useLocation();
    const [trainingMode, setTrainingMode] = useState(false);

    // Navigating out of the training area turns it off. Deferred by a timer rather
    // than set during the effect so the page being navigated to renders once with the
    // mode it was entered under, instead of flipping presentation mid-transition.
    useEffect(() => {
        if (isTrainingPath(location.pathname)) return;
        const resetTimer = window.setTimeout(() => setTrainingMode(false), 0);
        return () => window.clearTimeout(resetTimer);
    }, [location.pathname]);

    // Hiding the app turns it off, so the user has to switch it back on when they
    // return. This mirrors the browser releasing the real wake lock on hide, rather
    // than leaving the app claiming a mode it no longer has.
    useEffect(() => {
        const onHidden = () => {
            if (document.visibilityState === "hidden") setTrainingMode(false);
        };
        document.addEventListener("visibilitychange", onHidden);
        return () => document.removeEventListener("visibilitychange", onHidden);
    }, []);

    return [trainingMode, setTrainingMode];
}
