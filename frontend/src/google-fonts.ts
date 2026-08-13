import { matchesString } from "./strings";
import googleFontsData from "./assets/google-fonts.json";

// Single on/off switch for the whole experimental font picker (VITE_DEBUG
// locally, or on staging so it can be tried without a local build). This is
// the one thing every other integration point (App.tsx, TrainingControls)
// checks — see README.md's "Experimental font picker" section for the full
// list of files/lines to delete when this feature is retired.
export const isFontPickerEnabled =
    import.meta.env.VITE_DEBUG === "true" || import.meta.env.VITE_ENVIRONMENT === "staging";

export type FontCategory = "serif" | "sans-serif" | "display" | "handwriting" | "monospace";

export interface GoogleFont {
    family: string;
    category: FontCategory;
    subsets: string[];
}

export interface FontFilter {
    search: string;
    category: string; // "" = all
    subset: string; // "" = all
}

export const filterGoogleFonts = (fonts: GoogleFont[], filter: FontFilter): GoogleFont[] => {
    return fonts.filter(font =>
        matchesString(font.family, filter.search)
        && (filter.category === "" || font.category === filter.category)
        && (filter.subset === "" || font.subsets.includes(filter.subset)));
};

// Generic fallback appended after the chosen family, in case the web font
// fails to load. Google's own category taxonomy has no generic keyword for
// "display", so it falls back to serif — most display fonts are decorative
// serif/slab faces.
const genericFallback: Record<FontCategory, string> = {
    "serif": "serif",
    "sans-serif": "sans-serif",
    "monospace": "monospace",
    "handwriting": "cursive",
    "display": "serif",
};

const FONT_LINK_ID = "google-fonts-picker";

const googleFontsCssUrl = (family: string) =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;

export const allGoogleFonts = googleFontsData as GoogleFont[];

export const findGoogleFont = (family: string): GoogleFont | undefined =>
    allGoogleFonts.find(font => font.family === family);

// Loads the chosen family from Google Fonts (or removes it) and overrides the
// app's global font. Both --bs-body-font-family and --app-display-font are
// declared at :root, so the override must be set on document.documentElement
// itself -- most descendants below <body> just inherit body's already-resolved
// font-family rather than re-reading the custom property, so setting it any
// lower in the tree (e.g. via a React inline style) would silently do nothing.
export const applyFontFamily = (family: string | null): void => {
    const existingLink = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    const font = family ? findGoogleFont(family) : undefined;

    if (!family || !font) {
        existingLink?.remove();
        document.documentElement.style.removeProperty("--bs-body-font-family");
        document.documentElement.style.removeProperty("--app-display-font");
        return;
    }

    const link = existingLink ?? document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = googleFontsCssUrl(font.family);
    if (!existingLink) document.head.appendChild(link);

    const value = `"${font.family}", ${genericFallback[font.category]}`;
    document.documentElement.style.setProperty("--bs-body-font-family", value);
    document.documentElement.style.setProperty("--app-display-font", value);
};
