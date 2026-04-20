import { createContext } from "react";

export type Language = "ja" | "sv" | "en" | "tr";

export interface Translations {
  [lang: string]: { [text: string]: string; }
}

interface Options {
  capitalize?: boolean;
}

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

  const langtrans = translations[lang];

  for(const key in langtrans) {
    if (key.localeCompare(text.toString(), "sv-SE",  { sensitivity: 'base' }) === 0)
      return postProcess(lang, langtrans[key], options);
  }

  return postProcess(lang, text, options);
}

const postProcess = (lang: Language, text: string, options?: Options): string => {
  if (lang === "ja") {
    return text;
  }

  if (options?.capitalize) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
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
