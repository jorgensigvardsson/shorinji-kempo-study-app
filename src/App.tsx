import { useContext, useEffect, useState } from 'react';
import './App.css'
import { type GradePlan, type GradeName } from './data'
import { TranslationsContext, TranslatorContext, TranslatorImplementation, type Language, type Translator } from './i18n';
import { Container, Nav, Navbar, NavDropdown, Offcanvas } from 'react-bootstrap';
import { getRoutes, routeText, type Route } from './routes';
import { Outlet, Route as DomRoute, Routes, NavLink, useLocation } from 'react-router-dom';
import type { Data } from './persistence/data';
import type { HokeiNotes } from './persistence/app-data';

interface Props {
  gradePlans: GradePlan[];
  textSizeData: Data<number>;
  gradeData: Data<GradeName>;
  languageData: Data<Language>;
  notesData: HokeiNotes;
}

function App(props: Props) {
  const { gradePlans, languageData, gradeData, notesData, textSizeData } = props;
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
        <AppNavbar routes={routes} translator={translator} className="d-print-none"/>
        <div className="app-route-content">
          {renderRoutes(routes)}
          <Outlet />
        </div>
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
  className?: string;
}

const AppNavbar = (props: NavbarProps) => {
  const { routes, className, translator } = props;
  const [show, setShow] = useState(false);
  const location = useLocation();
  const normalizedPath = location.pathname.endsWith("/") && location.pathname.length > 1
    ? location.pathname.slice(0, -1)
    : location.pathname;
  const mainMenuRoutes = routes.filter(route => route.showInMainMenu);
  const dropdownRoutes = routes.filter(route => !route.showInMainMenu);
  const isDropdownActive = dropdownRoutes.some(route => location.pathname === route.path);
  const activeRoute = routes.find(route => route.path === normalizedPath);
  const navbarTitle = activeRoute ? routeText(activeRoute) : translator.translate("Shorinji Kempo");

  return (
    <Navbar expand="lg" className={`bg-body-tertiary ${className}`} sticky="top">
      <Container>
        <Navbar.Brand href="/" className="app-navbar-brand">
          <img src="/shorinjikempo.png" className="logo" />
          <span className="app-navbar-title">{navbarTitle}</span>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" onClick={() => setShow(true)} />
        <Navbar.Offcanvas id="basic-navbar-nav" placement="end"
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
                return <Nav.Link className="menu-item" as={NavLink} key={index} to={route.path} onClick={() => setShow(false)}>{route.icon && <>&nbsp;&nbsp;<route.icon size={20} /></>}&nbsp;&nbsp;{routeText(route)}</Nav.Link>
              })}
            </Nav>
            <Nav className="me-auto d-none d-lg-flex menu-main-nav" variant="pills">
              {mainMenuRoutes.map((route, index) => (
                <Nav.Link className="menu-item menu-no-wrap" as={NavLink} key={index} to={route.path}>
                  {route.icon && <>&nbsp;&nbsp;<route.icon size={20} /></>}&nbsp;&nbsp;{routeText(route)}
                </Nav.Link>
              ))}
              {dropdownRoutes.length > 0 && (
                <NavDropdown title={translator.translate("Mer")} id="desktop-more-menu" active={isDropdownActive}>
                  {dropdownRoutes.map((route, index) => (
                    <NavDropdown.Item as={NavLink} key={index} to={route.path} className="menu-dropdown-item">
                      {route.icon && <span className="menu-dropdown-icon"><route.icon size={16} /></span>}
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

export default App;
