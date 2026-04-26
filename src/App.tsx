import { useContext, useEffect, useRef, useState } from 'react';
import './App.css'
import { type GradePlan, type GradeName } from './data'
import { TranslationsContext, TranslatorContext, TranslatorImplementation, type Language, type Translator } from './i18n';
import { Button, Container, Nav, Navbar, NavDropdown, Offcanvas, Toast, ToastContainer } from 'react-bootstrap';
import { getRoutes, routeText, type Route } from './routes';
import { Outlet, Route as DomRoute, Routes, NavLink, useLocation } from 'react-router-dom';
import type { Data } from './persistence/data';
import type { HokeiNotes, HokeiRanks } from './persistence/app-data';
import { ArrowClockwise } from 'react-bootstrap-icons';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface Props {
  gradePlans: GradePlan[];
  textSizeData: Data<number>;
  gradeData: Data<GradeName>;
  languageData: Data<Language>;
  notesData: HokeiNotes;
  ranksData: HokeiRanks;
}

function App(props: Props) {
  const { gradePlans, languageData, gradeData, notesData, ranksData, textSizeData } = props;
  const [ language, setLanguage ] = useState<Language>(languageData.data);
  const [ textZoom, setTextZoom ] = useState<number>(textSizeData.data);
  const [ grade, setGrade ] = useState<GradeName>(gradePlans.find(g => g.grade === gradeData.data)!.grade);
  const translations = useContext(TranslationsContext);
  const translator = new TranslatorImplementation(translations, language);
  const routes = getRoutes(
    gradePlans.find(l => l.grade === grade)!,
    gradePlans,
    translator,
    notesData,
    ranksData,
    textZoom,
    lang => languageData.save(lang),
    g => gradeData.save(g.grade),
    size => textSizeData.save(size)
  );

  useEffect(() => languageData.registerListener(l => setLanguage(l)), [languageData]);
  useEffect(() => gradeData.registerListener(g => setGrade(g)), [gradeData]);
  useEffect(() => textSizeData.registerListener(size => setTextZoom(size)), [textSizeData]);

  return (
    <TranslatorContext.Provider value={translator}>
      <div style={{ zoom: textZoom }}>
        <AppNavbar routes={routes} translator={translator} textZoom={textZoom} className="d-print-none"/>
        <div className="app-route-content">
          {renderRoutes(routes)}
          <Outlet />
        </div>
        <UpdateToast translator={translator} />
      </div>
    </TranslatorContext.Provider>
  )
}

function renderRoutes(routes: Route[]) {
  return (
    <Routes>
      {routes.map((route, index) => (
        <DomRoute key={index} path={route.path} element={<route.component />} />
      ))}
    </Routes>
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
  const [isDesktopMenu, setIsDesktopMenu] = useState(() => window.matchMedia("(min-width: 992px)").matches);
  const location = useLocation();
  const normalizedPath = location.pathname.endsWith("/") && location.pathname.length > 1
    ? location.pathname.slice(0, -1)
    : location.pathname;
  const mainMenuRoutes = routes.filter(route => route.showInMainMenu);
  const dropdownRoutes = routes.filter(route => !route.showInMainMenu);
  const isDropdownActive = dropdownRoutes.some(route => location.pathname === route.path);
  const activeRoute = routes.find(route => route.path === normalizedPath);
  const navbarTitle = isDesktopMenu
    ? translator.translate("Shorinji Kempo")
    : (activeRoute ? routeText(activeRoute) : translator.translate("Shorinji Kempo"));

  useEffect(() => {
    const media = window.matchMedia("(min-width: 992px)");
    const onChange = (event: MediaQueryListEvent) => setIsDesktopMenu(event.matches);
    setIsDesktopMenu(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <Navbar expand="lg" className={`bg-body-tertiary ${className}`} sticky="top">
      <Container>
        <Navbar.Brand href="/" className="app-navbar-brand">
          <img src="/shorinjikempo.png" className="logo" />
          <span className="app-navbar-title">{navbarTitle}</span>
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
              {routes.map((route, index) => {
                return (
                  <Nav.Link className="menu-item" as={NavLink} key={index} to={route.path} onClick={() => setShow(false)}>
                    {route.icon && <span className="menu-route-icon"><route.icon size={20} /></span>}
                    {routeText(route)}
                  </Nav.Link>
                );
              })}
            </Nav>
            <Nav className="me-auto d-none d-lg-flex menu-main-nav" variant="pills">
              {mainMenuRoutes.map((route, index) => (
                <Nav.Link className="menu-item menu-no-wrap" as={NavLink} key={index} to={route.path}>
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
                  {dropdownRoutes.map((route, index) => (
                    <NavDropdown.Item as={NavLink} key={index} to={route.path} className="menu-dropdown-item">
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

const UpdateToast = (props: { translator: Translator }) => {
  const { translator } = props;
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

  const handleUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    setNeedRefresh(false);
  };

  return (
    <ToastContainer position="bottom-end" className="app-update-toast-container p-3">
      <Toast show={needRefresh} className="app-update-toast">
        <Toast.Body className="app-update-toast-body">
          <div className="app-update-toast-icon" aria-hidden="true">
            <ArrowClockwise size={20} />
          </div>
          <div className="app-update-toast-copy">
            <div className="app-update-toast-title">{translator.translate("Ny version tillgänglig")}</div>
            <div className="app-update-toast-text">{translator.translate("Ladda om när du vill uppdatera appen.")}</div>
          </div>
          <Button size="sm" variant="primary" className="app-update-toast-action" onClick={handleUpdate}>
            {translator.translate("Uppdatera")}
          </Button>
        </Toast.Body>
      </Toast>
    </ToastContainer>
  );
}

export default App;
