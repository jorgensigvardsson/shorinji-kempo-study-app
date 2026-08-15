import { useContext, useEffect } from "react";
import { TranslatorContext, type Language } from "./i18n";
import { type ChangelogChange, markChangelogSeen } from "./changelog";
import { CHANGELOG, CURRENT_VERSION } from "./changelog-entries";
import "./Changelog.css";

interface DateGroup {
  date: string;
  changes: ChangelogChange[];
}

function groupByDate(): DateGroup[] {
  const groups = new Map<string, ChangelogChange[]>();
  for (const entry of CHANGELOG) {
    const date = entry.timestamp.slice(0, 10);
    const existing = groups.get(date) ?? [];
    groups.set(date, existing.concat(entry.changes));
  }
  return Array.from(groups.entries()).map(([date, changes]) => ({ date, changes }));
}

const Changelog = () => {
  const translator = useContext(TranslatorContext);
  const lang = translator.currentLanguage as Language;

  useEffect(() => {
    markChangelogSeen(CURRENT_VERSION);
    window.dispatchEvent(new Event("changelog-seen"));
  }, []);

  const groups = groupByDate();

  return (
    <div>
      {groups.map(({ date, changes }) => (
        <div key={date} className="mb-4">
          <p className="text-secondary mb-2 small">
            {new Date(`${date}T12:00:00Z`).toLocaleDateString(langToLocale(lang), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div>
            {changes.map((change, j) => (
              <div key={j} className="changelog-item">
                <span className="changelog-item-emoji">{change.emoji}</span>
                <span>{change[lang]}</span>
              </div>
            ))}
          </div>
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
