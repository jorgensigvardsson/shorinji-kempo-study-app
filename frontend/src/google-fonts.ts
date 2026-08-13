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

// Generic keyword that closes the chosen family's stack, in case the web font
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

const googleFontsCssUrl = (family: string) =>
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;

export const allGoogleFonts = googleFontsData as GoogleFont[];

export const findGoogleFont = (family: string): GoogleFont | undefined =>
    allGoogleFonts.find(font => font.family === family);

// Body text, headings and Japanese text are picked independently (they're
// different design decisions -- e.g. a display face for headings paired with a
// plain one for body copy, and a Japanese face that has to work under both), so
// each target gets its own <link> and its own CSS variable(s).
//
// "kanji" covers kanji, hiragana and katakana alike: it is applied by ordering
// rather than by tagging the text, so the browser picks it per character for
// anything the Latin faces cannot render -- no markup and no script detection.
// It therefore has no target of its own in the stacks; it slots into both the
// body and the heading stack. See the comment at the top of src/index.css.
export type FontTarget = "body" | "heading" | "kanji";

interface TargetCssVars {
    // Holds the family name alone. The stacks in index.css put the layers in
    // the order that makes per-character fallback work.
    face: string;
    // Where the family's generic keyword goes, when the stack has a slot for
    // it. "kanji" has none on purpose: the body/display generic already
    // follows the Japanese layer in every stack, so it doubles as the kanji
    // font's fallback -- and a generic of its own, sitting that high up, would
    // on a CJK-capable system render the kanji itself and cut off everything
    // below it (see the comment at the top of src/index.css).
    fallback?: string;
}

const cssVarsByTarget: Record<FontTarget, TargetCssVars> = {
    body: { face: "--app-body-face", fallback: "--app-body-fallback" },
    heading: { face: "--app-display-face", fallback: "--app-display-fallback" },
    kanji: { face: "--app-kanji-font" },
};

const fontLinkId = (target: FontTarget) => `google-fonts-picker-${target}`;

// Loads the chosen family from Google Fonts (or removes it) and overrides the
// app's font for that target. The variables are all declared at :root, so the
// override must be set on document.documentElement itself -- most descendants
// below <body> just inherit body's already-resolved font-family rather than
// re-reading the custom property, so setting it any lower in the tree (e.g. via
// a React inline style) would silently do nothing.
export const applyFontFamily = (target: FontTarget, family: string | null): void => {
    const linkId = fontLinkId(target);
    const { face, fallback } = cssVarsByTarget[target];
    const existingLink = document.getElementById(linkId) as HTMLLinkElement | null;
    const font = family ? findGoogleFont(family) : undefined;

    if (!family || !font) {
        existingLink?.remove();
        document.documentElement.style.removeProperty(face);
        if (fallback) document.documentElement.style.removeProperty(fallback);
        return;
    }

    const link = existingLink ?? document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = googleFontsCssUrl(font.family);
    if (!existingLink) document.head.appendChild(link);

    document.documentElement.style.setProperty(face, `"${font.family}"`);
    if (fallback) document.documentElement.style.setProperty(fallback, genericFallback[font.category]);
};
