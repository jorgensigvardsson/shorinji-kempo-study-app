import { useContext, useEffect, useState } from 'react';
import './App.css'
import { type Level, type LevelName } from './data'
import { TranslationsContext, TranslatorContext, TranslatorImplementation, type Language } from './i18n';
import { Container, Nav, Navbar, Offcanvas } from 'react-bootstrap';
import { getRoutes, type Route } from './routes';
import { Outlet, Route as DomRoute, Routes, Link } from 'react-router-dom';
import type { Data } from './persistence/data';
import type { HokeiNotes } from './persistence/app-data';
import { CardSettingsContext, type CardSettings } from './persistence/card-settings';

interface Props {
  levels: Level[];
  cardSettingsData: Data<CardSettings>;
  levelData: Data<LevelName>;
  languageData: Data<Language>;
  notesData: HokeiNotes;
}

function App(props: Props) {
  const { levels, languageData, levelData, notesData, cardSettingsData } = props;
  const [ language, setLanguage ] = useState<Language>(languageData.data);
  const [ cardSettings, setCardSettings ] = useState<CardSettings>(cardSettingsData.data);
  const [ level, setLevel ] = useState<LevelName>(levels.find(l => l.name === levelData.data)!.name);
  const translations = useContext(TranslationsContext);
  const translator = new TranslatorImplementation(translations, language);
  const routes = getRoutes(
    levels.find(l => l.name === level)!,
    levels,
    translator,
    notesData,
    cardSettings.cardTextSize,
    lang => languageData.save(lang),
    level => levelData.save(level.name),
    size => cardSettingsData.save({ cardTextSize: size })
  );

  useEffect(() => languageData.registerListener(l => setLanguage(l)), [languageData]);
  useEffect(() => levelData.registerListener(l => setLevel(l)), [levelData]);
  useEffect(() => cardSettingsData.registerListener(l => setCardSettings(l)), [cardSettingsData]);

  return (
    <CardSettingsContext.Provider value={cardSettingsData.data}>
      <TranslatorContext.Provider value={translator}>
        <AppNavbar routes={routes} className="d-print-none"/>
        {renderRoutes(routes)}
        <Outlet />
      </TranslatorContext.Provider>
    </CardSettingsContext.Provider>
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
  className?: string;
}

const AppNavbar = (props: NavbarProps) => {
  const { routes, className } = props;
  const [show, setShow] = useState(false);

  return (
    <Navbar expand="lg" className={`bg-body-tertiary ${className}`} sticky="top">
      <Container>
        <Navbar.Brand href="/"><img src="/shorinjikempo.png" className="logo" />ShorinjiKempo Study App</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" onClick={() => setShow(true)} />
        <Navbar.Offcanvas id="basic-navbar-nav" placement="end"
          show={show} onHide={() => setShow(false)}>
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>Shorinji kempo training app</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            <Nav className="me-auto">
              {routes.map((route, index) => (
                <Nav.Link className="menu-item" as={Link} key={index} to={route.path} onClick={() => setShow(false)}>{route.icon && <route.icon size={20} />}&nbsp;&nbsp;{route.menuText}</Nav.Link>
              ))}
            </Nav>
          </Offcanvas.Body>
        </Navbar.Offcanvas>
      </Container>
    </Navbar>
  );
}

export default App;
