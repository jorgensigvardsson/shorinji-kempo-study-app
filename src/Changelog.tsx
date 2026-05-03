import { useContext, useEffect } from "react";
import { TranslatorContext, type Language } from "./i18n";
import { CHANGELOG, markChangelogSeen } from "./changelog";

const Changelog = () => {
  const translator = useContext(TranslatorContext);
  const lang = translator.currentLanguage as Language;

  useEffect(() => {
    markChangelogSeen();
    window.dispatchEvent(new Event("changelog-seen"));
  }, []);

  return (
    <div>
      {CHANGELOG.map((entry, i) => (
        <div key={i} className="mb-4">
          <p className="text-secondary mb-2 small">
            {new Date(entry.timestamp).toLocaleDateString(langToLocale(lang), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <ul>
            {entry.changes.map((change, j) => (
              <li key={j}>{change[lang]}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

function langToLocale(lang: Language): string {
  switch (lang) {
    case "sv": return "sv-SE";
    case "en": return "en-US";
    case "tr": return "tr-TR";
    case "ja": return "ja-JP";
  }
}

export default Changelog;
