import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './App.css'
import { findGradePlan, type GradePlan, type GradeName } from './data'
import { TranslatorContext, TranslatorImplementation, type Translator } from './i18n';
import { Button, Container, Nav, Navbar, NavDropdown, Offcanvas, Toast, ToastContainer } from 'react-bootstrap';
import { getRoutes, preloadPages, routeText, type Route } from './routes';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Data } from './persistence/data';
import { ArrowClockwise, ArrowLeftRight, Bell, ExclamationTriangle, Megaphone } from 'react-bootstrap-icons';
import { useIdleTask, useSyncProvider, useSyncState, useTheme, useTranslations, useWakeLock } from './hooks';
import { ensureTranslations } from './translations';
import RouteContent from './components/RouteContent';
import { getSyncManager } from './sync/manager';
import { LoginScreen } from './LoginScreen';
import TrainingControls from './components/TrainingControls';
import { useAppUpdate } from './app-update';
import { useTrainingMode } from './training-mode';
import { markChangelogSeen, unseenChangelog, type ChangelogUpdate } from './changelog';
import { getCurrentSubscription, isPushSupported, subscribeToPush } from './push';
import SelectionWordLookup from './components/SelectionWordLookup';
import { getTrainingControlContext } from './training-controls-context';
import { applyFontFamily, isFontPickerEnabled, type FontFilter } from './google-fonts';
import { setAppData, useAppData } from './persistence/use-app-data';

interface Props {
  gradePlans: GradePlan[];
  textSizeData: Data<number>;
  bodyFontFamilyData: Data<string>;
  headingFontFamilyData: Data<string>;
  kanjiFontFamilyData: Data<string>;
}

const STANDALONE_IDLE_RESET_MS = 10 * 60 * 1000;
const NOTIF_PROMPT_DISMISSED_KEY = "notifications-prompt-dismissed";
function isStandalonePwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function App(props: Props) {
  const { gradePlans, textSizeData, bodyFontFamilyData, headingFontFamilyData, kanjiFontFamilyData } = props;
  // Theme application belongs to the app lifecycle, not to whichever page
  // happens to need the theme value. This also reacts to synced changes.
  useTheme();
  const language = useAppData("language");
  const [ textZoom, setTextZoom ] = useState<number>(textSizeData.data);
  const [ bodyFontFamily, setBodyFontFamily ] = useState<string>(bodyFontFamilyData.data);
  const [ headingFontFamily, setHeadingFontFamily ] = useState<string>(headingFontFamilyData.data);
  const [ kanjiFontFamily, setKanjiFontFamily ] = useState<string>(kanjiFontFamilyData.data);
  // Session-only (not persisted): just needs to survive the toolbar's own
  // auto-collapse-on-navigate behavior, not a page reload.
  const [ bodyFontFilter, setBodyFontFilter ] = useState<FontFilter>({ search: "", category: "", subset: "" });
  const [ headingFontFilter, setHeadingFontFilter ] = useState<FontFilter>({ search: "", category: "", subset: "" });
  // The kanji picker starts filtered to the Japanese subset: a font without
  // kanji/kana glyphs would leave the app looking untouched (Japanese text just
  // falls through it to the next face in the stack), which reads as a bug.
  // Clearing the language filter is still allowed, it's only the starting point.
  const [ kanjiFontFilter, setKanjiFontFilter ] = useState<FontFilter>({ search: "", category: "", subset: "japanese" });
  // The user's own grade, as stored and synced.
  const profileGrade = useAppData("grade");
  // The training controls can temporarily show another grade's material without
  // touching the user's own grade. That override is session-only, and a real
  // grade change — from Settings, or arriving over sync — clears it. Resetting
  // during render rather than in an effect avoids a frame showing the stale
  // override. See https://react.dev/learn/you-might-not-need-an-effect
  const [ gradeOverride, setGradeOverride ] = useState<GradeName | null>(null);
  const [ lastProfileGrade, setLastProfileGrade ] = useState<GradeName>(profileGrade);
  if (lastProfileGrade !== profileGrade) {
    setLastProfileGrade(profileGrade);
    setGradeOverride(null);
  }
  const displayGrade = gradeOverride ?? profileGrade;
  const translations = useTranslations();
  const translator = new TranslatorImplementation(translations, language);
  // A language whose section is not loaded with the app — Turkish — arrives here.
  // Until it does the app renders the Swedish source text, which is why main.tsx
  // waits for it before the first paint rather than leaving it to this.
  useEffect(() => { void ensureTranslations(language); }, [language]);
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
  const location = useLocation();
  const controlContext = getTrainingControlContext(location.pathname);
  const [trainingMode, setTrainingMode] = useTrainingMode();
  const routes = getRoutes(
    findGradePlan(gradePlans, displayGrade),
    findGradePlan(gradePlans, profileGrade),
    gradePlans,
    translator,
    textZoom,
    lang => setAppData("language", lang),
    g => setAppData("grade", g.grade),
    size => textSizeData.save(size),
    trainingMode,
  );

  // Fetch the other pages once the first one has settled. Without this a navigation
  // made before the service worker has precached them keeps the current page on
  // screen with nothing to show that anything is happening.
  useIdleTask(() => void preloadPages());

  useEffect(() => textSizeData.registerListener(size => setTextZoom(size)), [textSizeData]);
  useEffect(() => bodyFontFamilyData.registerListener(f => setBodyFontFamily(f)), [bodyFontFamilyData]);
  useEffect(() => headingFontFamilyData.registerListener(f => setHeadingFontFamily(f)), [headingFontFamilyData]);
  useEffect(() => kanjiFontFamilyData.registerListener(f => setKanjiFontFamily(f)), [kanjiFontFamilyData]);
  // Re-applies on every mount too, so a previously-chosen font survives a reload
  // (the <link> tag and :root overrides don't persist across page loads on their own).
  useEffect(() => applyFontFamily("body", bodyFontFamily || null), [bodyFontFamily]);
  useEffect(() => applyFontFamily("heading", headingFontFamily || null), [headingFontFamily]);
  useEffect(() => applyFontFamily("kanji", kanjiFontFamily || null), [kanjiFontFamily]);

  // An account is required: everything below the login screen assumes a signed-in
  // user, so the provider doubles as the gate. Signing out (or a session that
  // can't be renewed) sets it back to "local" and the login screen returns.
  const { syncProvider } = useSyncProvider();
  // Local frontend development can run without the Go services. Vite hard-codes
  // DEV to false in production builds, so this escape hatch cannot bypass the
  // account requirement in a deployed build even if the variable is set there.
  const devBypassAuth = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";
  const showSignIn = syncProvider !== "backend" && !devBypassAuth;

  // Auto-apply pending versions for unauthenticated visitors (login screen);
  // authenticated users get the "Update" toast via the returned needRefresh.
  const { needRefresh, applyUpdate, reloadIntoLatest } = useAppUpdate(showSignIn);

  // Training mode combines the existing Dojo presentation with the screen wake
  // lock. It can follow the user between training views, but the wake lock is
  // only requested while the control is relevant on the current page.
  useWakeLock(trainingMode && controlContext.showTrainingMode);

  // Reserve space at the bottom of the page equal to the floating toast stack's
  // footprint, so the user can scroll the last
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
          <LoginScreen />
        </div>
      </TranslatorContext.Provider>
    );
  }

  return (
    <TranslatorContext.Provider value={translator}>
      <div style={{ zoom: textZoom }}>
        <AppNavbar routes={routes} translator={translator} textZoom={textZoom} className="d-print-none" />
        <div className="app-route-content" style={{
          '--floating-stack-reserve': `${floatingReserve}px`,
          '--training-controls-reserve': controlContext.showGrade || controlContext.showTrainingMode || isFontPickerEnabled ? '4.75rem' : '0px',
        } as CSSProperties}>
          <RouteContent routes={routes} translator={translator} />
          <Outlet />
        </div>
        {/* Bottom-right floating stack for transient toasts. Its full height is
            reserved at the bottom of the page (--floating-stack-reserve) so
            nothing here ever covers content when scrolled to the end. */}
        <div ref={floatingRef} className="app-floating-stack d-print-none">
          <AppToasts translator={translator} needRefresh={needRefresh} onUpdate={applyUpdate} onReloadIntoLatest={reloadIntoLatest} />
        </div>
        <TrainingControls
          grade={displayGrade}
          gradePlans={gradePlans}
          onGradeChange={setGradeOverride}
          showGrade={controlContext.showGrade}
          showTrainingMode={controlContext.showTrainingMode}
          trainingMode={trainingMode}
          onTrainingModeChange={setTrainingMode}
          bodyFontPicker={isFontPickerEnabled
            ? { value: bodyFontFamily, onChange: f => bodyFontFamilyData.save(f), filter: bodyFontFilter, onFilterChange: setBodyFontFilter }
            : undefined}
          headingFontPicker={isFontPickerEnabled
            ? { value: headingFontFamily, onChange: f => headingFontFamilyData.save(f), filter: headingFontFilter, onFilterChange: setHeadingFontFilter }
            : undefined}
          kanjiFontPicker={isFontPickerEnabled
            ? { value: kanjiFontFamily, onChange: f => kanjiFontFamilyData.save(f), filter: kanjiFontFilter, onFilterChange: setKanjiFontFilter }
            : undefined}
        />
        <SelectionWordLookup />
      </div>
    </TranslatorContext.Provider>
  )
}

interface NavbarProps {
  routes: Route[];
  translator: Translator;
  textZoom: number;
  className?: string;
}

const AppNavbar = (props: NavbarProps) => {
  const { routes, className, translator, textZoom } = props;
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

const AppToasts = (props: { translator: Translator; needRefresh: boolean; onUpdate: () => void; onReloadIntoLatest: () => void }) => {
  const { translator, needRefresh, onUpdate, onReloadIntoLatest } = props;
  const navigate = useNavigate();
  const lang = translator.currentLanguage;

  // --- changelog toast ---
  // The entries arrive on their own chunk, so the toast appears a beat after the page
  // rather than with it. That is no loss: it is a notice about the release, not
  // something the user came here for.
  const [changelogUpdate, setChangelogUpdate] = useState<ChangelogUpdate | null>(null);
  useEffect(() => {
    let cancelled = false;
    void unseenChangelog().then(update => {
      if (!cancelled) setChangelogUpdate(update);
    });
    const handler = () => setChangelogUpdate(null);
    window.addEventListener("changelog-seen", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("changelog-seen", handler);
    };
  }, []);
  const dismissChangelog = () => {
    if (changelogUpdate) markChangelogSeen(changelogUpdate.version);
    setChangelogUpdate(null);
  };

  // --- notifications opt-in prompt ---
  // A one-time shortcut for enabling push notifications. The full control lives
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

  // --- sync toasts ---
  const syncState = useSyncState();

  // An expired session can't be renewed silently, so sign out — that flips the
  // provider back to "local" and App swaps in the login screen.
  useEffect(() => {
    if (syncState.status === "auth_expired") {
      getSyncManager().disconnect();
    }
  }, [syncState.status]);

  return (
    <ToastContainer className="app-update-toast-container">
      <Toast show={changelogUpdate !== null} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon" aria-hidden="true">
            <Megaphone size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Nyheter")}</div>
            <div className="app-update-toast-changelog-list">
              {(changelogUpdate?.changes ?? []).map((change, i) => (
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
      {/* Syncing has stopped because this build predates the shape the account's data
          is stored in, and writing it back would delete the parts it cannot read.
          Unlike a sync error there is nothing to retry, so the toast has no dismiss:
          it stays until the app is updated. */}
      <Toast show={syncState.status === "client_outdated"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <ExclamationTriangle size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Appen behöver uppdateras")}</div>
            <div className="app-update-toast-text">
              {translator.translate("Dina ändringar sparas på den här enheten, men synkas inte förrän appen har uppdaterats.")}
            </div>
          </div>
          <Button size="sm" variant="primary" className="app-update-toast-action" onClick={onReloadIntoLatest}>
            {translator.translate("Uppdatera")}
          </Button>
        </Toast.Body>
      </Toast>
      {/* The document has outgrown what the server accepts. Like the outdated-client
          toast there is nothing to retry, so no dismiss — but there is also no button,
          because nothing the app offers today makes the document smaller. It says what
          has stopped and what has not, which is the honest extent of it. */}
      <Toast show={syncState.status === "document_too_large"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <ExclamationTriangle size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("För mycket data för att synka")}</div>
            <div className="app-update-toast-text">
              {translator.translate("Dina ändringar sparas på den här enheten, men når inte dina andra enheter. Ta bort några anteckningar för att komma under gränsen.")}
            </div>
          </div>
        </Toast.Body>
      </Toast>
      <Toast show={syncState.status === "error"} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon app-update-toast-icon--warning" aria-hidden="true">
            <ExclamationTriangle size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Synkfel")}</div>
            <div className="app-update-toast-text">{translator.translate("Kunde inte synka med servern. Försöker igen automatiskt.")}</div>
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
    </ToastContainer>
  );
}

export default App;
