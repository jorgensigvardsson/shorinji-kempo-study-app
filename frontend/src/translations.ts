import ja from "./assets/translations.ja.json";
import en from "./assets/translations.en.json";
import type { Language, Translations } from "./i18n";

// Japanese and English load with the app. Japanese because kanji sit beside every
// technique name whatever the interface language is, and English because the dojo
// card headers ask for the English name of a technique by name. Turkish is only ever
// read by a Turkish reader, and it is a quarter of the startup bundle, so it is
// fetched once that turns out to be who is reading.
//
// Swedish is absent from all of this because it is the source language: the keys are
// the Swedish text, and i18n falls through to the key when a section has no entry.
const onDemand: Partial<Record<Language, () => Promise<{ default: Record<string, string> }>>> = {
    tr: () => import("./assets/translations.tr.json"),
};

// An external store rather than a constant, because a language can arrive after the
// app has started — someone switching to Turkish in Settings, most obviously. The
// object identity changes when it does, which is what tells React to re-render and
// what invalidates the lookup cache i18n keys on it.
let current: Translations = { ja, en };
const listeners = new Set<() => void>();

export const getTranslations = (): Translations => current;

export const subscribeTranslations = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

// Resolves once `language` can be rendered without falling back to the Swedish source
// text. Immediate for the languages already held, which is all of them but Turkish.
export const ensureTranslations = async (language: Language): Promise<void> => {
    const load = onDemand[language];
    if (!load || current[language]) return;

    const { default: section } = await load();
    // Two callers can race here; the first one to arrive wins and the second is a
    // no-op, rather than replacing the object and notifying for no change.
    if (current[language]) return;

    current = { ...current, [language]: section };
    for (const listener of [...listeners]) listener();
};

// Every remaining section. Used where a language is about to be chosen, so that
// choosing it does not have to wait.
export const ensureAllTranslations = async (): Promise<void> => {
    await Promise.all((Object.keys(onDemand) as Language[]).map(ensureTranslations));
};
