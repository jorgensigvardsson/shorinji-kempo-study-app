import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read from disk rather than imported: `?raw` yields an empty string for a stylesheet,
// because Vite's CSS pipeline claims the request before the raw loader sees it.
const css = readFileSync(resolve(process.cwd(), "src/components/HokeiCard.css"), "utf8");

// This reads the stylesheet as text because there is no layout in the test environment
// to exercise the fixed card against a real visual viewport.
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

  it("sizes the card in the viewport's unmodified coordinate space", () => {
    expect(css).not.toContain("--app-zoom-inverse");
    expect(focusCardRules().some(rule => rule.includes("100dvh") && rule.includes("--card-focus-top"))).toBe(true);
  });
});

describe("the inline hokei card's responsive layout", () => {
  it("uses the card itself as the responsive container", () => {
    expect(css).toMatch(
      /\.hokei-card\s*{[^}]*container-name:\s*hokei-card;[^}]*container-type:\s*inline-size;/s
    );
    expect(css).toMatch(
      /@container hokei-card \(max-width:\s*30rem\)\s*{[\s\S]*?\.kamoku-card-stage\s*{/
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
});
