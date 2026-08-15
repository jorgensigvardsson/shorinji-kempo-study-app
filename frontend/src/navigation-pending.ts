// React Router runs a navigation as a transition, and React holds back the whole
// commit until the page being navigated to is ready to render. When that page is a
// chunk still on its way, nothing on screen changes at all — not the content, not the
// navbar, not even the clicked link's own highlight. The click looks ignored.
//
// Nothing already on screen can be used to detect that: every component, inside the
// routed area or outside it, is still rendering the previous location. So the fact
// that a navigation was asked for is recorded here instead, by whatever handled the
// click. Being outside React's transition, this update commits immediately.

let pending: string | null = null;
const listeners = new Set<() => void>();

const notify = () => {
    for (const listener of [...listeners]) listener();
};

export const getPendingNavigation = (): string | null => pending;

export const subscribePendingNavigation = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

// Called by whatever starts a navigation, before handing over to the router.
export const beginNavigation = (path: string): void => {
    // Navigating to where we already are commits nothing, so there would be no
    // location change to end it and the indicator would stay up for good.
    if (path === window.location.pathname) return;
    if (pending === path) return;
    pending = path;
    notify();
};

export const endNavigation = (): void => {
    if (pending === null) return;
    pending = null;
    notify();
};
