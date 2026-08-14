import { StrictMode, type ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import StagingBadge from './components/StagingBadge.tsx'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/bootstrap-theme.scss';
import App from './App.tsx'
import { BrowserRouter } from "react-router-dom";
import gradePlans from './assets/kamokuhyo.json';
import translations from './assets/translations.json';
import { TranslationsContext } from './i18n.ts';
import { load } from './persistence/data.ts';
import { HokeiNotes, HokeiRanks } from './persistence/app-data.ts';
import { DefaultTextSize, TextSizeStorageKey } from './persistence/text-size.ts';
import { DefaultFontFamily, FontFamilyBodyStorageKey, FontFamilyHeadingStorageKey, FontFamilyKanjiStorageKey } from './persistence/font-family.ts';
import { type GradePlan } from './data.ts'
import { getSyncManager } from './sync/manager.ts';

// Grade and language are read straight from the app-data store by useAppData,
// so they need no wrapper here and no trip through App's props.
const textSizeData = load<number>(TextSizeStorageKey, DefaultTextSize);
const bodyFontFamilyData = load<string>(FontFamilyBodyStorageKey, DefaultFontFamily);
const headingFontFamilyData = load<string>(FontFamilyHeadingStorageKey, DefaultFontFamily);
const kanjiFontFamilyData = load<string>(FontFamilyKanjiStorageKey, DefaultFontFamily);
const notesData = new HokeiNotes();
const ranksData = new HokeiRanks();
getSyncManager().start();

function mountRoot() {
  render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <TranslationsContext value={translations}>
            <App gradePlans={gradePlans as GradePlan[]} notesData={notesData} ranksData={ranksData} textSizeData={textSizeData}
                 bodyFontFamilyData={bodyFontFamilyData} headingFontFamilyData={headingFontFamilyData}
                 kanjiFontFamilyData={kanjiFontFamilyData}/>
          </TranslationsContext>
        </BrowserRouter>
        <StagingBadge />
      </ErrorBoundary>
    </StrictMode>
  )


  function render(node: ReactNode) {
    createRoot(document.getElementById('root')!).render(node);
  }
}

mountRoot();

