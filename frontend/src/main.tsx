import { StrictMode, type ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import StagingBadge from './components/StagingBadge.tsx'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/bootstrap-theme.scss';
import 'flag-icons/css/flag-icons.min.css';
import App from './App.tsx'
import { BrowserRouter } from "react-router-dom";
import gradePlans from './assets/kamokuhyo.json';
import { ensureTranslations } from './translations.ts';
import { getAppDataStore } from './persistence/store.ts';
import { load } from './persistence/data.ts';
import { DefaultTextSize, TextSizeStorageKey } from './persistence/text-size.ts';
import { DefaultFontFamily, FontFamilyBodyStorageKey, FontFamilyHeadingStorageKey, FontFamilyKanjiStorageKey } from './persistence/font-family.ts';
import { type GradePlan } from './data.ts'
import { getSyncManager } from './sync/manager.ts';
import RouteScrollManager from './components/RouteScrollManager.tsx';

// Older development sessions registered the PWA worker on localhost. Vite no longer
// does that, but an already-installed worker otherwise keeps controlling later
// sessions and can serve stale modules during hot reload. Remove it once; production
// builds keep their worker and offline support untouched.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async registrations => {
    const wasControlled = navigator.serviceWorker.controller !== null;
    const results = await Promise.all(registrations.map(registration => registration.unregister()));
    if (wasControlled && results.some(Boolean)) window.location.reload();
  });
}

// Grade and language are read straight from the app-data store by useAppData,
// so they need no wrapper here and no trip through App's props.
const textSizeData = load<number>(TextSizeStorageKey, DefaultTextSize);
const bodyFontFamilyData = load<string>(FontFamilyBodyStorageKey, DefaultFontFamily);
const headingFontFamilyData = load<string>(FontFamilyHeadingStorageKey, DefaultFontFamily);
const kanjiFontFamilyData = load<string>(FontFamilyKanjiStorageKey, DefaultFontFamily);
getSyncManager().start();

function mountRoot() {
  render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <RouteScrollManager />
          <App gradePlans={gradePlans as GradePlan[]} textSizeData={textSizeData}
               bodyFontFamilyData={bodyFontFamilyData} headingFontFamilyData={headingFontFamilyData}
               kanjiFontFamilyData={kanjiFontFamilyData}/>
        </BrowserRouter>
        <StagingBadge />
      </ErrorBoundary>
    </StrictMode>
  )


  function render(node: ReactNode) {
    createRoot(document.getElementById('root')!).render(node);
  }
}

// Wait for the stored language's translations before painting anything. Resolves in a
// microtask for every language whose section ships with the app, and only actually
// waits for a network fetch when this device belongs to a Turkish reader — who would
// otherwise watch the interface arrive in Swedish and then change under them.
void ensureTranslations(getAppDataStore().get("language")).then(mountRoot);

