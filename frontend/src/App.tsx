import { useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import './App.css'
import { type GradePlan, type GradeName } from './data'
import { TranslationsContext, TranslatorContext, TranslatorImplementation, type Language, type Translator } from './i18n';
import { Button, Container, Nav, Navbar, NavDropdown, Offcanvas, Toast, ToastContainer } from 'react-bootstrap';
import { getRoutes, routeText, type Route } from './routes';
import { Outlet, Route as DomRoute, Routes, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Data } from './persistence/data';
import type { HokeiNotes, HokeiRanks } from './persistence/app-data';
import { ArrowClockwise, ArrowLeftRight, Bell, CloudSlash, ExclamationTriangle, Megaphone } from 'react-bootstrap-icons';
import { useSyncProvider, useSyncState, useWakeLock } from './hooks';
import { getSyncManager } from './sync/manager';
import { LoginScreen } from './LoginScreen';
import WakeLockToggle from './components/WakeLockToggle';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CHANGELOG, isChangelogUnseen, markChangelogSeen } from './changelog';
import { getCurrentSubscription, isPushSupported, subscribeToPush } from './push';
import SelectionWordLookup from './components/SelectionWordLookup';

interface Props {
  gradePlans: GradePlan[];
  textSizeData: Data<number>;
  gradeData: Data<GradeName>;
  languageData: Data<Language>;
  notesData: HokeiNotes;
  ranksData: HokeiRanks;
}

const STANDALONE_IDLE_RESET_MS = 10 * 60 * 1000;
const BACKEND_ENABLED = import.meta.env.VITE_BACKEND_ENABLED === "true";
const IDENTITY_CHOICE_KEY = "identity-choice-made";
const NOTIF_PROMPT_DISMISSED_KEY = "notifications-prompt-dismissed";
// Hide the keep-screen-on control entirely where the Screen Wake Lock API is
// unavailable — there's nothing it could do there.
const WAKE_LOCK_SUPPORTED = typeof navigator !== "undefined" && "wakeLock" in navigator;

function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Service-worker update handling. Registration and waiting-SW detection run here,
// at the top of App, so they're active regardless of auth state. When `autoApply`
// is set (an unauthenticated visitor, e.g. on the login screen) a pending version
// is applied immediately and silently — there's no in-progress work to protect.
// In-app users get `needRefresh` instead, surfaced as the "Update" toast, so a
// new version never interrupts them mid-task.
function useAppUpdate(autoApply: boolean) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration;
      if (registration) {
        if (registration.waiting) {
          setNeedRefresh(true);
        }
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current?.waiting) {
        setNeedRefresh(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Hand control to the waiting SW and reload once it takes over. Returns false
  // if there's nothing waiting (so callers know it was a no-op).
  const activateWaiting = useCallback(() => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) return false;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }, []);

  // The "Update" toast button: apply and drop the prompt.
  const applyUpdate = useCallback(() => {
    if (activateWaiting()) setNeedRefresh(false);
  }, [activateWaiting]);

  // Unauthenticated visitors (e.g. the login screen) have no in-progress work to
  // protect, so a pending version is applied immediately and silently — no toast.
  // This covers both a fresh load with a version already waiting and logging out
  // while one is pending.
  useEffect(() => {
    if (autoApply && needRefresh) activateWaiting();
  }, [autoApply, needRefresh, activateWaiting]);

  return { needRefresh, applyUpdate };
}

function App(props: Props) {
  const { gradePlans, languageData, gradeData, notesData, ranksData, textSizeData } = props;
  const [ language, setLanguage ] = useState<Language>(languageData.data);
  const [ textZoom, setTextZoom ] = useState<number>(textSizeData.data);
  const [ nextGrade, setNextGrade ] = useState<GradeName>(gradePlans.find(g => g.grade === gradeData.data)!.grade);
  const translations = useContext(TranslationsContext);
  const translator = new TranslatorImplementation(translations, language);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isStandalonePwa()) return;
    let hiddenAt: number | null = null;
    const handler = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible" && hiddenAt !== null) {
        const elapsed = Date.now() - hiddenAt;
        hiddenAt = null;
        if (elapsed >= STANDALONE_IDLE_RESET_MS) {
          navigate("/", { replace: true });
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [navigate]);
  const routes = getRoutes(
    gradePlans.find(l => l.grade === nextGrade)!,
    gradePlans,
    translator,
    notesData,
    ranksData,
    textZoom,
    lang => languageData.save(lang),
    g => gradeData.save(g.grade),
    size => textSizeData.save(size),
    () => setShowSignIn(true)
  );

  useEffect(() => languageData.registerListener(l => setLanguage(l)), [languageData]);
  useEffect(() => gradeData.registerListener(g => setNextGrade(g)), [gradeData]);
  useEffect(() => textSizeData.registerListener(size => setTextZoom(size)), [textSizeData]);

  const { syncProvider } = useSyncProvider();
  const [showSignIn, setShowSignIn] = useState(
    () => BACKEND_ENABLED && localStorage.getItem(IDENTITY_CHOICE_KEY) !== "true"
  );
  // Auto-hide when the user completes sign-in (provider switches to "backend").
  useEffect(() => {
    if (syncProvider === "backend") {
      localStorage.setItem(IDENTITY_CHOICE_KEY, "true");
      setShowSignIn(false);
    }
  }, [syncProvider]);

  const handleContinueAnonymously = () => {
    localStorage.setItem(IDENTITY_CHOICE_KEY, "true");
    setShowSignIn(false);
  };

  // Auto-apply pending versions for unauthenticated visitors (login screen);
  // authenticated users get the "Update" toast via the returned needRefresh.
  const { needRefresh, applyUpdate } = useAppUpdate(showSignIn);

  // Shared "keep screen on" state. GUI-only for now — no real wake lock yet.
  // Lives here so the drawer toggle (small screens) and the floating toggle
  // (large screens) reflect the same value.
  const [keepAwake, setKeepAwake] = useState(false);
  // Acquire/release the actual Screen Wake Lock to match the toggle.
  useWakeLock(keepAwake);
  // Reset to off whenever the route changes, so the toggle can't silently stay
  // on after the user moves to a different page (the "I forgot it was on" guard).
  const location = useLocation();
  useEffect(() => { setKeepAwake(false); }, [location.pathname]);

  // No persistent state across app switches: when the app is hidden, turn the
  // toggle off so the user must re-activate it on return. This also mirrors the
  // browser auto-releasing the real wake lock when the tab is hidden.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") setKeepAwake(false);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // Reserve space at the bottom of the page equal to the floating stack's
  // footprint (toasts + the wake-lock card), so the user can scroll the last
  // line clear of all of it. The stack shrink-wraps its visible children, so the
  // reserve grows and shrinks as toasts appear/disappear, and collapses to 0
  // when the stack is empty (e.g. small screens with no toast showing).
  const floatingRef = useRef<HTMLDivElement>(null);
  const [floatingReserve, setFloatingReserve] = useState(0);
  useEffect(() => {
    const el = floatingRef.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      setFloatingReserve(h > 0 ? h + 16 : 0); // + 1rem bottom gap (CSS: bottom: 1rem)
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (showSignIn) {
    return (
      <TranslatorContext.Provider value={translator}>
        <div style={{ zoom: textZoom }}>
          <LoginScreen onContinueAnonymously={handleContinueAnonymously} />
        </div>
      </TranslatorContext.Provider>
    );
  }

  return (
    <TranslatorContext.Provider value={translator}>
      <div style={{ zoom: textZoom }}>
        <AppNavbar routes={routes} translator={translator} textZoom={textZoom} className="d-print-none"
          keepAwake={keepAwake} onKeepAwakeChange={setKeepAwake} />
        <div className="app-route-content" style={{ '--floating-stack-reserve': `${floatingReserve}px` } as CSSProperties}>
          {renderRoutes(routes)}
          <Outlet />
        </div>
        {/* Bottom-right floating stack: transient toasts above, the persistent
            wake-lock card (lg+) pinned at the corner. The stack's full height is
            reserved at the bottom of the page (--floating-stack-reserve) so
            nothing here ever covers content when scrolled to the end. */}
        <div ref={floatingRef} className="app-floating-stack d-print-none">
          <AppToasts translator={translator} onShowLogin={() => setShowSignIn(true)}
            needRefresh={needRefresh} onUpdate={applyUpdate} />
          {WAKE_LOCK_SUPPORTED && (
            <WakeLockToggle variant="card" className="d-none d-lg-block" active={keepAwake} onChange={setKeepAwake} />
          )}
        </div>
        <SelectionWordLookup />
      </div>
    </TranslatorContext.Provider>
  )
}

function renderRoutes(routes: Route[]) {
  return (
    <Routes>
      {routes.filter(r => r.path && r.component).map((route, index) => {
        const Component = route.component!;
        return <DomRoute key={index} path={route.path!} element={<Component />} />;
      })}
    </Routes>
  )
}

interface NavbarProps {
  routes: Route[];
  translator: Translator;
  textZoom: number;
  className?: string;
  keepAwake: boolean;
  onKeepAwakeChange: (active: boolean) => void;
}

const AppNavbar = (props: NavbarProps) => {
  const { routes, className, translator, textZoom, keepAwake, onKeepAwakeChange } = props;
  const [show, setShow] = useState(false);
  const location = useLocation();
  const visibleMenuRoutes = routes.filter(route => !route.hideFromMenu);
  const mainMenuRoutes = visibleMenuRoutes.filter(route => route.showInMainMenu);
  const dropdownRoutes = visibleMenuRoutes.filter(route => !route.showInMainMenu);
  const isDropdownActive = dropdownRoutes.some(route => route.path && location.pathname === route.path);

  return (
    <Navbar expand="lg" className={`bg-body-tertiary ${className}`} sticky="top">
      <Container>
        <Navbar.Brand as={NavLink} to="/" className="app-navbar-brand">
          <img src="/shorinjikempo.png" className="logo" />
          <span className="app-navbar-title">{translator.translate("Shorinji Kempo")}</span>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" onClick={() => setShow(true)} />
        <Navbar.Offcanvas id="basic-navbar-nav" placement="end" style={{ zoom: textZoom }}
          show={show} onHide={() => setShow(false)}>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title className="app-offcanvas-title">
              <img src="/shorinjikempo.png" className="logo" />
              <span>{translator.translate("Shorinji Kempo")}</span>
            </Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            <Nav className="me-auto d-lg-none" variant="pills">
              {visibleMenuRoutes.map((route, index) => route.href ? (
                <Nav.Link className="menu-item" key={index} href={route.href} onClick={() => setShow(false)}>
                  {route.icon && <span className="menu-route-icon"><route.icon size={20} /></span>}
                  {routeText(route)}
                </Nav.Link>
              ) : (
                <Nav.Link className="menu-item" as={NavLink} key={index} to={route.path!} onClick={() => setShow(false)}>
                  {route.icon && <span className="menu-route-icon"><route.icon size={20} /></span>}
                  {routeText(route)}
                </Nav.Link>
              ))}
            </Nav>
            {/* Drawer toggle, small screens only (the floating one takes over at lg). */}
            {WAKE_LOCK_SUPPORTED && (
              <div className="d-lg-none mt-3 px-1">
                <WakeLockToggle active={keepAwake} onChange={onKeepAwakeChange} className="w-100 justify-content-center" />
              </div>
            )}
            <Nav className="me-auto d-none d-lg-flex menu-main-nav" variant="pills">
              {mainMenuRoutes.map((route, index) => route.href ? (
                <Nav.Link className="menu-item menu-no-wrap" key={index} href={route.href}>
                  {route.icon && <span className="menu-route-icon"><route.icon size={20} /></span>}
                  {routeText(route)}
                </Nav.Link>
              ) : (
                <Nav.Link className="menu-item menu-no-wrap" as={NavLink} key={index} to={route.path!}>
                  {route.icon && <span className="menu-route-icon"><route.icon size={20} /></span>}
                  {routeText(route)}
                </Nav.Link>
              ))}
              {dropdownRoutes.length > 0 && (
                <NavDropdown
                  title={translator.translate("Mer")}
                  id="desktop-more-menu"
                  active={isDropdownActive}
                  className="menu-more-dropdown"
                >
                  {dropdownRoutes.map((route, index) => route.href ? (
                    <NavDropdown.Item key={index} href={route.href} className="menu-dropdown-item">
                      {route.icon && <span className="menu-dropdown-icon menu-route-icon"><route.icon size={16} /></span>}
                      {routeText(route)}
                    </NavDropdown.Item>
                  ) : (
                    <NavDropdown.Item as={NavLink} key={index} to={route.path!} className="menu-dropdown-item">
                      {route.icon && <span className="menu-dropdown-icon menu-route-icon"><route.icon size={16} /></span>}
                      {routeText(route)}
                    </NavDropdown.Item>
                  ))}
                </NavDropdown>
              )}
            </Nav>
          </Offcanvas.Body>
        </Navbar.Offcanvas>
      </Container>
    </Navbar>
  );
}

const AppToasts = (props: { translator: Translator; onShowLogin: () => void; needRefresh: boolean; onUpdate: () => void }) => {
  const { translator, onShowLogin, needRefresh, onUpdate } = props;
  const navigate = useNavigate();
  const lang = translator.currentLanguage;

  // --- changelog toast ---
  const [showChangelogToast, setShowChangelogToast] = useState(() => isChangelogUnseen());
  useEffect(() => {
    const handler = () => setShowChangelogToast(false);
    window.addEventListener("changelog-seen", handler);
    return () => window.removeEventListener("changelog-seen", handler);
  }, []);
  const dismissChangelog = () => {
    markChangelogSeen();
    setShowChangelogToast(false);
  };

  // --- notifications opt-in prompt ---
  // A one-time shortcut for enabling push notifications, shown to everyone
  // (signed-in or anonymous, since both can subscribe). The full control lives
  // in Settings; this is just a nudge. Suppressed once enabled or dismissed.
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(NOTIF_PROMPT_DISMISSED_KEY) === "true") return;
    if (!isPushSupported() || Notification.permission === "denied") return;
    let cancelled = false;
    // Only nudge devices that aren't already subscribed.
    void getCurrentSubscription().then(sub => {
      if (!cancelled && sub === null) setShowNotifPrompt(true);
    });
    return () => { cancelled = true; };
  }, []);
  const dismissNotifPrompt = () => {
    localStorage.setItem(NOTIF_PROMPT_DISMISSED_KEY, "true");
    setShowNotifPrompt(false);
  };
  const enableNotifFromPrompt = async () => {
    setNotifBusy(true);
    try {
      let perm = Notification.permission;
      if (perm !== "granted") perm = await Notification.requestPermission();
      if (perm === "granted") await subscribeToPush();
    } catch {
      // If anything fails the user can still enable from Settings.
    } finally {
      setNotifBusy(false);
      dismissNotifPrompt();
    }
  };

  // --- update toast ---
  // SW registration and the pending-version state live in App's useAppUpdate hook
  // (so they run even when unauthenticated); here we just render the prompt.

  // --- reconnect toast ---
  const syncState = useSyncState();
  const { syncProvider } = useSyncProvider();
  const providerLabel = syncProvider === "onedrive" ? "OneDrive"
    : syncProvider === "google-drive" ? "Google Drive"
    : syncProvider === "dropbox" ? "Dropbox"
    : translator.translate("molntjänsten");

  // When the backend session expires, redirect to the login screen instead of
  // showing a generic "sync disconnected" toast.
  useEffect(() => {
    if (syncProvider === "backend" && syncState.status === "auth_expired") {
      localStorage.removeItem(IDENTITY_CHOICE_KEY);
      getSyncManager().disconnect();
      onShowLogin();
    }
  }, [syncState.status, syncProvider, onShowLogin]);

  return (
    <ToastContainer className="app-update-toast-container">
      <Toast show={showChangelogToast} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon" aria-hidden="true">
            <Megaphone size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Nyheter")}</div>
            <div className="app-update-toast-changelog-list">
              {CHANGELOG[0].changes.map((change, i) => (
                <div key={i} className="app-update-toast-changelog-item">
                  <span>{change.emoji}</span>
                  <span>{change[lang]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="d-flex flex-column gap-2 app-update-toast-action">
            <Button size="sm" variant="primary" onClick={() => { navigate("/changelog"); dismissChangelog(); }}>
              {translator.translate("Visa")}
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={dismissChangelog}>
              {translator.translate("Stäng")}
            </Button>
          </div>
        </Toast.Body>
      </Toast>
      <Toast show={showNotifPrompt} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon" aria-hidden="true">
            <Bell size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Slå på notiser")}</div>
            <div className="app-update-toast-text">
              {translator.translate("Få ett meddelande när en ny version av appen finns. Du kan ändra detta under Inställningar.")}
            </div>
          </div>
          <div className="d-flex flex-column gap-2 app-update-toast-action">
            <Button size="sm" variant="primary" onClick={() => { void enableNotifFromPrompt(); }} disabled={notifBusy}>
              {translator.translate("Aktivera notiser")}
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={dismissNotifPrompt} disabled={notifBusy}>
              {translator.translate("Stäng")}
            </Button>
          </div>
        </Toast.Body>
      </Toast>
      <Toast show={needRefresh} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon" aria-hidden="true">
            <ArrowClockwise size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Ny version tillgänglig")}</div>
            <div className="app-update-toast-text">
              {translator.translate("Ladda om när du vill uppdatera appen.")}{" "}
              <a href="#" className="app-update-changelog-link" onClick={e => { e.preventDefault(); navigate("/changelog"); }}>
                {translator.translate("Se nyheter")}
              </a>
            </div>
          </div>
          <Button size="sm" variant="primary" className="app-update-toast-action" onClick={onUpdate}>
            {translator.translate("Uppdatera")}
          </Button>
        </Toast.Body>
      </Toast>
      <Toast show={syncState.status === "error"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <ExclamationTriangle size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Synkfel")}</div>
            <div className="app-update-toast-text">{translator.translate("Kunde inte synka med {0}. Försöker igen automatiskt.", { params: [providerLabel] })}</div>
          </div>
          <Button size="sm" variant="warning" className="app-update-toast-action"
            onClick={() => getSyncManager().retrySync()}>
            {translator.translate("Försök nu")}
          </Button>
        </Toast.Body>
      </Toast>
      <Toast show={syncState.status === "conflict_resolution"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <ArrowLeftRight size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Inställningarna ändrades på flera enheter")}</div>
            <div className="app-update-toast-text">{translator.translate("Vilken enhet har rätt inställningar?")}</div>
          </div>
          <div className="d-flex flex-column gap-2 app-update-toast-action">
            <Button size="sm" variant="primary"
              onClick={() => getSyncManager().resolveConflict("local")}>
              {translator.translate("Den här enheten")}
            </Button>
            <Button size="sm" variant="outline-secondary"
              onClick={() => getSyncManager().resolveConflict("remote")}>
              {translator.translate("Den andra enheten")}
            </Button>
          </div>
        </Toast.Body>
      </Toast>
      <Toast show={syncState.status === "auth_expired" && syncProvider !== "backend"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <CloudSlash size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Synken har kopplats från")}</div>
            <div className="app-update-toast-text">{translator.translate("Anslutningen till {0} har gått ut.", { params: [providerLabel] })}</div>
          </div>
          <Button size="sm" variant="primary" className="app-update-toast-action"
            onClick={() => getSyncManager().connect()}>
            {translator.translate("Anslut igen")}
          </Button>
        </Toast.Body>
      </Toast>
    </ToastContainer>
  );
}

export default App;
