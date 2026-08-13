import { afterEach, describe, expect, it } from "vitest";
import { applyFontFamily, filterGoogleFonts, type GoogleFont } from "./google-fonts";

const fonts: GoogleFont[] = [
    { family: "Roboto", category: "sans-serif", subsets: ["latin", "latin-ext"] },
    { family: "Roboto Mono", category: "monospace", subsets: ["latin"] },
    { family: "Playfair Display", category: "serif", subsets: ["latin", "cyrillic"] },
    { family: "Noto Sans JP", category: "sans-serif", subsets: ["japanese", "latin"] },
];

describe("filterGoogleFonts", () => {
    it("returns everything when the filter is empty", () => {
        expect(filterGoogleFonts(fonts, { search: "", category: "", subset: "" })).toEqual(fonts);
    });

    it("filters by case-insensitive name substring", () => {
        expect(filterGoogleFonts(fonts, { search: "roboto", category: "", subset: "" }))
            .toEqual([fonts[0], fonts[1]]);
    });

    it("filters by category", () => {
        expect(filterGoogleFonts(fonts, { search: "", category: "monospace", subset: "" }))
            .toEqual([fonts[1]]);
    });

    it("filters by subset", () => {
        expect(filterGoogleFonts(fonts, { search: "", category: "", subset: "japanese" }))
            .toEqual([fonts[3]]);
    });

    it("combines search, category, and subset filters", () => {
        expect(filterGoogleFonts(fonts, { search: "roboto", category: "sans-serif", subset: "latin-ext" }))
            .toEqual([fonts[0]]);
    });

    it("returns an empty array when nothing matches", () => {
        expect(filterGoogleFonts(fonts, { search: "nonexistent", category: "", subset: "" })).toEqual([]);
    });
});

describe("applyFontFamily", () => {
    afterEach(() => {
        applyFontFamily("body", null);
        applyFontFamily("heading", null);
        applyFontFamily("kanji", null);
    });

    it("sets only the target's own CSS variables and link, leaving the other targets untouched", () => {
        applyFontFamily("body", "Roboto");

        expect(document.documentElement.style.getPropertyValue("--app-body-face")).toContain("Roboto");
        expect(document.documentElement.style.getPropertyValue("--app-display-face")).toBe("");
        expect(document.documentElement.style.getPropertyValue("--app-kanji-font")).toBe("");
        expect(document.getElementById("google-fonts-picker-body")).not.toBeNull();
        expect(document.getElementById("google-fonts-picker-heading")).toBeNull();
        expect(document.getElementById("google-fonts-picker-kanji")).toBeNull();
    });

    it("sets the chosen family's generic keyword as the stack's closing fallback", () => {
        applyFontFamily("heading", "Playfair Display");

        expect(document.documentElement.style.getPropertyValue("--app-display-fallback")).toBe("serif");
    });

    it("gives the kanji target no fallback variable of its own", () => {
        // A generic keyword there resolves to the OS default face, which on a
        // CJK-capable system draws the kanji itself -- cutting off everything
        // listed below it in the stack.
        applyFontFamily("kanji", "Noto Sans JP");

        expect(document.documentElement.style.getPropertyValue("--app-kanji-font")).toContain("Noto Sans JP");
        expect(document.documentElement.style.getPropertyValue("--app-kanji-fallback")).toBe("");
    });

    it("lets body, heading and kanji carry different fonts at the same time", () => {
        applyFontFamily("body", "Roboto");
        applyFontFamily("heading", "Playfair Display");
        applyFontFamily("kanji", "Noto Sans JP");

        expect(document.documentElement.style.getPropertyValue("--app-body-face")).toContain("Roboto");
        expect(document.documentElement.style.getPropertyValue("--app-display-face")).toContain("Playfair Display");
        expect(document.documentElement.style.getPropertyValue("--app-kanji-font")).toContain("Noto Sans JP");
    });

    it("removing one target's font doesn't affect the others", () => {
        applyFontFamily("body", "Roboto");
        applyFontFamily("heading", "Playfair Display");
        applyFontFamily("kanji", "Noto Sans JP");

        applyFontFamily("body", null);

        expect(document.documentElement.style.getPropertyValue("--app-body-face")).toBe("");
        expect(document.documentElement.style.getPropertyValue("--app-body-fallback")).toBe("");
        expect(document.documentElement.style.getPropertyValue("--app-display-face")).toContain("Playfair Display");
        expect(document.documentElement.style.getPropertyValue("--app-kanji-font")).toContain("Noto Sans JP");
    });
});
