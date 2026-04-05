import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import App from './App.tsx'
import { BrowserRouter } from "react-router-dom";
import levels from './assets/kamokuhyo.json';
import translations from './assets/kamokuhyo.translations.json';
import type { Level, LevelName } from './data.ts';
import { TranslationsContext, type Language } from './i18n.ts';
import { load } from './persistence/data.ts';
import { HokeiNotes } from './persistence/app-data.ts';
import { DefaultCardSettings, type CardSettings } from './persistence/card-settings.ts';

const levelData = load<LevelName>("level", "Dan1");
const languageData = load<Language>("language", "sv");
const cardSettingsData = load<CardSettings>("card-settings", DefaultCardSettings);
const notesData = new HokeiNotes();

function mountRoot() {
  render(
    <StrictMode>
      <BrowserRouter>
        <TranslationsContext value={translations}>
          <App levelData={levelData} languageData={languageData}
               levels={levels as Level[]} notesData={notesData} cardSettingsData={cardSettingsData}/>
        </TranslationsContext>
      </BrowserRouter>
    </StrictMode>
  )


  function render(node: ReactNode) {
    createRoot(document.getElementById('root')!).render(node);
  }
}

mountRoot();
