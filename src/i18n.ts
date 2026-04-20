import { createContext } from "react";

export type Language = "ja" | "sv" | "en" | "tr";

export interface Translations {
  [lang: string]: { [text: string]: string; }
}

interface Options {
  capitalize?: boolean;
}

const languageLookupCache = new WeakMap<Translations, Map<Language, Map<string, string>>>();

export const i18n = (translations: Translations, lang: Language, text: string | number, options?: Options): string => {
  if (typeof text === "number") {
    if (lang === "ja" && text >= 0 && Number.isInteger(text)) {
      return numberToKanji(text);
    } else {
      return text.toString();
    }
  }

  if (!(lang in translations))
    return postProcess(lang, text, options);

  const key = normalizeLookupKey(text.toString(), lang);
  const langLookup = getLanguageLookup(translations, lang);
  const translated = langLookup.get(key);
  if (translated !== undefined)
    return postProcess(lang, translated, options);

  return postProcess(lang, text, options);
}

const postProcess = (lang: Language, text: string, options?: Options): string => {
  if (lang === "ja") {
    return text;
  }

  if (options?.capitalize) {
    return capitalizeFirstCharacter(text, lang);
  }
  return text;
}

const getLocale = (lang: Language): string => {
  switch (lang) {
    case "sv":
      return "sv-SE";
    case "en":
      return "en-US";
    case "tr":
      return "tr-TR";
    default:
      return "ja-JP";
  }
}

const normalizeLookupKey = (text: string, lang: Language): string => {
  return text.toLocaleLowerCase(getLocale(lang));
}

const getLanguageLookup = (translations: Translations, lang: Language): Map<string, string> => {
  let translationsCache = languageLookupCache.get(translations);
  if (!translationsCache) {
    translationsCache = new Map<Language, Map<string, string>>();
    languageLookupCache.set(translations, translationsCache);
  }

  const cachedLanguageLookup = translationsCache.get(lang);
  if (cachedLanguageLookup)
    return cachedLanguageLookup;

  const languageEntries = translations[lang] ?? {};
  const languageLookup = new Map<string, string>();
  for (const [key, value] of Object.entries(languageEntries)) {
    languageLookup.set(normalizeLookupKey(key, lang), value);
  }

  translationsCache.set(lang, languageLookup);
  return languageLookup;
}

const capitalizeFirstCharacter = (text: string, lang: Language): string => {
  if (text.length === 0)
    return text;

  const match = text.match(/^\s*\S/);
  if (!match)
    return text;

  const firstChar = match[0][match[0].length - 1];
  const index = text.indexOf(firstChar);
  if (index < 0)
    return text;

  const upper = firstChar.toLocaleUpperCase(getLocale(lang));
  return text.slice(0, index) + upper + text.slice(index + firstChar.length);
}

export const japanese = (translations: Translations, text: string | number): string => {
  return i18n(translations, "ja", text);
}

const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const units = ["", "十", "百", "千"];
const bigUnits = ["", "万", "億", "兆"];

export const numberToKanji = (n: number): string => {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("Input must be a natural number");
  }
  if (n === 0) return digits[0];

  let result = "";
  let bigUnitIndex = 0;

  while (n > 0) {
    const chunk = n % 10000;
    if (chunk !== 0) {
      result = chunkToKanji(chunk) + bigUnits[bigUnitIndex] + result;
    }
    n = Math.floor(n / 10000);
    bigUnitIndex++;
  }

  return result;

  function chunkToKanji (n: number): string {
    let result = "";
    let unitIndex = 0;

    while (n > 0) {
      const digit = n % 10;
      if (digit !== 0) {
        result =
          (digit === 1 && unitIndex > 0 ? "" : digits[digit]) +
          units[unitIndex] +
          result;
      }
      n = Math.floor(n / 10);
      unitIndex++;
    }

    return result;
  }
}

export interface Translator {
  get currentLanguage(): Language;
  get isJapanese(): boolean;
  translate(text: string | number, options?: Options): string;
  explicitTranslate(language: Language, text: string | number, options?: Options): string;
  japanese(text: string | number): string;
}

export class TranslatorImplementation {
  constructor(private translations: Translations, public currentLanguage: Language) {

  }

  get isJapanese(): boolean {
    return this.currentLanguage === "ja";
  }

  explicitTranslate(language: Language, text: string | number, options?: Options): string {
    return i18n(this.translations, language, text, options);
  }

  translate(text: string | number, options?: Options): string {
    return i18n(this.translations, this.currentLanguage, text, options);
  }

  japanese(text: string | number): string {
    return japanese(this.translations, text);
  }
}

export const TranslationsContext = createContext<Translations>({ });
export const TranslatorContext = createContext<Translator>(new TranslatorImplementation({}, "sv"));
