import { Suspense } from "react";
import { Button } from "react-bootstrap";
import { Route as DomRoute, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import type { Route } from "../routes";
import type { Translator } from "../i18n";

// The app's routed area: the pages themselves, plus the two things that only matter
// because those pages arrive on their own chunks — somewhere to wait, and somewhere
// for a chunk that never arrives to land.
const RouteContent = ({ routes, translator }: { routes: Route[]; translator: Translator }) => {
    const location = useLocation();

    return (
        // A page's chunk can fail to arrive — a release deployed while this tab was
        // open, before the service worker had precached the new files. Caught here
        // rather than at the root so the failure costs one page instead of the whole
        // app: the navbar survives, and the user can go somewhere that did load.
        // Keyed on the path so navigating away clears the error rather than leaving
        // the boundary stuck for the rest of the session.
        <ErrorBoundary
            key={location.pathname}
            fallback={() => (
                <div className="app-route-error">
                    <p>{translator.translate("Sidan kunde inte laddas. Ladda om appen och försök igen.")}</p>
                    <Button variant="primary" onClick={() => window.location.reload()}>
                        {translator.translate("Ladda om")}
                    </Button>
                </div>
            )}
        >
            {/* Every page but the start screen is a lazy chunk. React Router runs a
                navigation as a transition, so this fallback is not what a user
                normally sees — the previous page stays on screen instead. It shows
                when the app opens straight onto a lazy page: a deep link, or a PWA
                session restored where it was left. */}
            <Suspense fallback={<div className="app-route-loading" aria-busy="true" />}>
                <Routes>
                    {routes.filter(r => r.path && r.component).map((route, index) => {
                        const Component = route.component!;
                        return <DomRoute key={index} path={route.matchPath ?? route.path!} element={<Component />} />;
                    })}
                </Routes>
            </Suspense>
        </ErrorBoundary>
    );
};

export default RouteContent;
