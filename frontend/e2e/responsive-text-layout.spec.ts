import { expect, test, type Page } from "@playwright/test";

// Width alone leaves Chromium in desktop mode. Touch/mobile emulation exercises the
// meta viewport and the coordinate system used by controls on an actual phone.
test.use({
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});

const textSizes = [
  { label: "Liten", value: 1.0, key: "10" },
  { label: "Mindre", value: 1.1, key: "11" },
  { label: "Medium", value: 1.2, key: "12" },
  { label: "Större", value: 1.3, key: "13" },
  { label: "Störst", value: 1.4, key: "14" },
] as const;

const viewports = [
  { label: "smal mobil", width: 320, height: 800 },
  { label: "vanlig mobil", width: 390, height: 844 },
] as const;

const routes = [
  { label: "start", path: "/" },
  { label: "veckoplan", path: "/kamoku/plan" },
  { label: "fri träning – embu", path: "/kamoku/free/embu" },
  { label: "fri träning – randori", path: "/kamoku/free/randori" },
  { label: "gradering", path: "/training/grading" },
  { label: "hokei-flashkort", path: "/flashcard/hokei" },
  { label: "quiz", path: "/quiz" },
  { label: "ordlista", path: "/word-list" },
  { label: "inställningar", path: "/settings" },
] as const;

async function visibleLayoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const problems: string[] = [];
    if (window.innerWidth !== viewportWidth) {
      problems.push(`inner viewport is ${window.innerWidth}px but document viewport is ${viewportWidth}px`);
    }

    const visualViewport = window.visualViewport;
    if (visualViewport && Math.abs(visualViewport.width - viewportWidth) > 1) {
      problems.push(`visual viewport is ${visualViewport.width}px but layout viewport is ${viewportWidth}px`);
    }
    if (visualViewport && Math.abs(visualViewport.scale - 1) > 0.01) {
      problems.push(`visual viewport starts at scale ${visualViewport.scale}`);
    }
    if (document.documentElement.scrollWidth > viewportWidth + 1) {
      problems.push(`document is ${document.documentElement.scrollWidth - viewportWidth}px wider than the viewport`);
    }

    const selectors = [
      ".app-route-content",
      ".card",
      ".app-grid",
      ".app-update-toast",
      ".training-page-controls",
      ".app-bottom-nav",
    ];

    for (const element of document.querySelectorAll<HTMLElement>(selectors.join(","))) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.left < -1 || box.right > window.innerWidth + 1) {
        const name = element.className || element.tagName.toLowerCase();
        problems.push(`${name} leaves the viewport (${box.left.toFixed(1)}–${box.right.toFixed(1)})`);
      }
    }

    return problems;
  });
}

for (const viewport of viewports) {
  for (const size of textSizes) {
    test(`${viewport.label}: ${size.label} håller appens viktigaste vyer inom skärmen`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript(({ value }) => {
        localStorage.setItem("text-size", JSON.stringify(value));
      }, { value: size.value });

      for (const route of routes) {
        await test.step(route.label, async () => {
          await page.goto(route.path);
          const shell = page.locator(".app-shell");
          await expect(shell).toBeVisible();
          await expect(shell).toHaveAttribute("data-text-size", size.key);
          await expect(page.locator(".app-route-content")).toBeVisible();
          await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
            .toBe(`${16 * size.value}px`);
          await expect.poll(() => visibleLayoutProblems(page)).toEqual([]);
          if (route.path === "/settings") {
            const toggles = page.locator(".settings-dropdown .dropdown-toggle");
            const dismissToast = page.locator(".app-update-toast").getByRole("button", { name: "Stäng" }).first();
            if (await dismissToast.isVisible()) {
              await dismissToast.click();
            }

            await expect(toggles).toHaveCount(4);
            const controlsFit = await toggles.evaluateAll(elements =>
              elements.every(element => {
                const box = element.getBoundingClientRect();
                return box.left >= -1 && box.right <= window.innerWidth + 1;
              })
            );
            expect(controlsFit).toBe(true);

            for (let index = 0; index < await toggles.count(); index += 1) {
              await toggles.nth(index).click();
              const menu = page.locator(".settings-dropdown .dropdown-menu.show");
              await expect(menu).toBeVisible();
              const box = await menu.evaluate(element => element.getBoundingClientRect());
              expect(box.left).toBeGreaterThanOrEqual(-1);
              expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
              await page.keyboard.press("Escape");
            }
          }
        });

      }
    });
  }
}
