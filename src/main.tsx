import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/bootstrap-theme.scss';
import App from './App.tsx'
import { BrowserRouter } from "react-router-dom";
import gradePlans from './assets/kamokuhyo.json';
import translations from './assets/translations.json';
import { TranslationsContext, type Language } from './i18n.ts';
import { load } from './persistence/data.ts';
import { HokeiNotes } from './persistence/app-data.ts';
import { DefaultTextSize, TextSizeStorageKey } from './persistence/text-size.ts';
import { type GradeName, type GradePlan } from './data.ts'
import { getSyncManager } from './sync/manager.ts';

const gradeData = load<GradeName>("grade", "shodan");
const languageData = load<Language>("language", "sv");
const textSizeData = load<number>(TextSizeStorageKey, DefaultTextSize);
const notesData = new HokeiNotes();
getSyncManager().start();

function mountRoot() {
  render(
    <StrictMode>
      <BrowserRouter>
        <TranslationsContext value={translations}>
          <App gradeData={gradeData} languageData={languageData}
               gradePlans={gradePlans as GradePlan[]} notesData={notesData} textSizeData={textSizeData}/>
        </TranslationsContext>
      </BrowserRouter>
    </StrictMode>
  )


  function render(node: ReactNode) {
    createRoot(document.getElementById('root')!).render(node);
  }
}

mountRoot();

