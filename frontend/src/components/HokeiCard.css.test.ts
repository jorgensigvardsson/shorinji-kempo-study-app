import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read from disk rather than imported: `?raw` yields an empty string for a stylesheet,
// because Vite's CSS pipeline claims the request before the raw loader sees it.
const css = readFileSync(resolve(process.cwd(), "src/components/HokeiCard.css"), "utf8");

// The whole app renders inside a `zoom` wrapper — 1.1 by default, so this is the
// normal case rather than an edge one. A viewport length used inside that wrapper
// resolves against the real viewport and then gets scaled again on paint, so a height
// built from one comes out taller than the screen. For the focused card that means a
// card whose last lines cannot be reached: it scrolls, but the end of its scroll range
// is below the fold, and .card-focus-active stops the page itself from moving.
//
// This reads the stylesheet as text because there is no layout in the test environment
// to catch it any other way, and the failure is silent in every other respect.
const focusCardRules = (): string[] => {
  const rules: string[] = [];
  const selector = ".focus-card.is-expanded";
  for (let i = css.indexOf(selector); i !== -1; i = css.indexOf(selector, i + 1)) {
    const open = css.indexOf("{", i);
    const close = css.indexOf("}", open);
    if (open === -1 || close === -1) continue;
    // Skip descendant selectors like ".focus-card.is-expanded .card-head-title".
    if (css.slice(i + selector.length, open).trim() !== "") continue;
    rules.push(css.slice(open + 1, close));
  }
  return rules;
};

describe("the focused card's geometry", () => {
  it("has rules to check", () => {
    expect(focusCardRules().length).toBeGreaterThan(0);
  });

  it("hides floating controls that would cover the focused card", () => {
    expect(css).toMatch(
      /\.card-focus-active \.app-floating-stack,\s*\.card-focus-active \.training-controls-layer\s*{\s*display:\s*none;/
    );
  });

  it("keeps the compact video action beside a note until space runs out", () => {
    expect(css).toMatch(
      /\.kamoku-card-footer-actions \.kamoku-video-link\s*{[^}]*flex:\s*0 0 auto;/s
    );
    expect(css).not.toMatch(
      /\.kamoku-card-footer-actions \.hokei-inline-note\.has-note\s*{[^}]*flex-basis:\s*100%/s
    );
  });

  // Every declaration that reaches for the viewport has to convert back out of the
  // zoomed coordinate space, or the card is sized against the wrong ruler.
  it("compensates for the app's zoom wherever it uses a viewport length", () => {
    for (const rule of focusCardRules()) {
      for (const declaration of rule.split(";")) {
        if (!/\b\d+(dvh|vh|vw|dvw)\b/.test(declaration)) continue;
        expect(
          declaration,
          `"${declaration.trim()}" uses a viewport length without --app-zoom-inverse`
        ).toContain("--app-zoom-inverse");
      }
    }
  });

  // --card-focus-top is measured with getBoundingClientRect, which has already been
  // scaled by the zoom, so using it in here without converting places the card that
  // much too far down — and out of line with the backdrop, which sits outside the
  // wrapper and so uses the raw value correctly.
  it("converts the measured offset before positioning against it", () => {
    for (const rule of focusCardRules()) {
      for (const declaration of rule.split(";")) {
        const [property] = declaration.split(":");
        if (!/^\s*(top|bottom|height|max-height)\s*$/.test(property ?? "")) continue;
        if (!declaration.includes("--card-focus-top")) continue;
        expect(
          declaration,
          `"${declaration.trim()}" uses the measured offset without converting it`
        ).toContain("--app-zoom-inverse");
      }
    }
  });
});
