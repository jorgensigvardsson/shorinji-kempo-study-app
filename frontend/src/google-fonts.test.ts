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
    });

    it("sets only the target's own CSS variable and link, leaving the other target untouched", () => {
        applyFontFamily("body", "Roboto");

        expect(document.documentElement.style.getPropertyValue("--bs-body-font-family")).toContain("Roboto");
        expect(document.documentElement.style.getPropertyValue("--app-display-font")).toBe("");
        expect(document.getElementById("google-fonts-picker-body")).not.toBeNull();
        expect(document.getElementById("google-fonts-picker-heading")).toBeNull();
    });

    it("lets body and heading carry different fonts at the same time", () => {
        applyFontFamily("body", "Roboto");
        applyFontFamily("heading", "Playfair Display");

        expect(document.documentElement.style.getPropertyValue("--bs-body-font-family")).toContain("Roboto");
        expect(document.documentElement.style.getPropertyValue("--app-display-font")).toContain("Playfair Display");
    });

    it("removing one target's font doesn't affect the other", () => {
        applyFontFamily("body", "Roboto");
        applyFontFamily("heading", "Playfair Display");

        applyFontFamily("body", null);

        expect(document.documentElement.style.getPropertyValue("--bs-body-font-family")).toBe("");
        expect(document.documentElement.style.getPropertyValue("--app-display-font")).toContain("Playfair Display");
    });
});
