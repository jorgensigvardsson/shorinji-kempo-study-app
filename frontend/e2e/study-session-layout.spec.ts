import { expect, test, type Page } from "@playwright/test";
import { CURRENT_VERSION } from "../src/changelog-entries";
import { createDefaultAppDataDocument } from "../src/persistence/schema";
import wordList from "../src/assets/word-list.json" with { type: "json" };

const views = [
    { name: "phone", width: 390, height: 700, textSize: 1.1, colorScheme: "light", language: "sv" },
    { name: "small phone with largest text", width: 320, height: 568, textSize: 1.4, colorScheme: "dark", language: "sv" },
    { name: "landscape phone", width: 844, height: 390, textSize: 1, colorScheme: "light", language: "sv" },
    { name: "small phone in English", width: 320, height: 568, textSize: 1.4, colorScheme: "dark", language: "en" },
    { name: "small phone in Turkish", width: 320, height: 568, textSize: 1.4, colorScheme: "dark", language: "tr" },
] as const;

const routes = [
    "/flashcard/words", "/flashcard/footwork", "/flashcard/hokei", "/quiz/words",
    "/quiz/technique-groups", "/quiz/foot-stance", "/quiz/hand-position",
];

async function expectSessionToFit(page: Page) {
    await expect.poll(() => page.evaluate(() => {
        const problems: string[] = [];
        const documentBox = document.documentElement;
        if (documentBox.scrollHeight > innerHeight + 1) problems.push("page needs vertical scrolling");
        if (documentBox.scrollWidth > innerWidth + 1) problems.push("page needs horizontal scrolling");
        if (scrollY > 1) problems.push("page scrolled instead of card content");
        const nav = document.querySelector(".app-bottom-nav")!.getBoundingClientRect();
        for (const selector of [".study-session", ".quiz-actions, .flashcard-swipe-guide"]) {
            const element = document.querySelector(selector);
            if (!element) continue; // Experienced flashcard users have no footer.
            const box = element.getBoundingClientRect();
            if (box.top < 0 || box.bottom > nav.top + 1) problems.push(`${selector} leaves available screen`);
        }
        const content = document.querySelector<HTMLElement>(
            '.quiz-face[aria-hidden="false"] .quiz-main, .flashcard-face[aria-hidden="false"] .flashcard-main',
        )!;
        if (content.clientHeight < 40) problems.push("card content has no usable height");
        return problems;
    })).toEqual([]);
}

for (const view of views) {
    test.describe(`Study sessions: ${view.name}`, () => {
        test.use({
            viewport: { width: view.width, height: view.height },
            colorScheme: view.colorScheme,
            hasTouch: true, isMobile: true, ignoreHTTPSErrors: true, serviceWorkers: "block",
        });

        for (const path of routes) {
            test(`${path}: keeps both card faces and actions inside one screen while long content remains scrollable`, async ({ page }) => {
                test.setTimeout(180_000);
                const document = createDefaultAppDataDocument();
                document.data.language = view.language;
                // Exercise a real, unusually long dictionary definition.
                for (const word of wordList) {
                    if (path === "/flashcard/words" && word.id !== undefined && word.id !== 478) {
                        document.data.knownFlashCards[String(word.id)] = { known: true, updatedAt: document.updatedAt };
                    }
                }
                await page.addInitScript(({ document, textSize, theme, version }) => {
                    if (!localStorage.getItem("app-data-document")) {
                        localStorage.setItem("app-data-document", JSON.stringify(document));
                    }
                    localStorage.setItem("sync-provider", "backend");
                    localStorage.setItem("theme-preference", theme);
                    localStorage.setItem("text-size", JSON.stringify(textSize));
                    localStorage.setItem("lastSeenVersion", version);
                    localStorage.setItem("notifications-prompt-dismissed", "true");
                }, { document, textSize: view.textSize, theme: view.colorScheme, version: CURRENT_VERSION });
                await page.route("**/auth/**", route => {
                    if (new URL(route.request().url()).pathname === "/auth/me") {
                        return route.fulfill({ json: {
                            id: "00000000-0000-4000-8000-000000000002",
                            email: "study@example.invalid", displayName: "Layoutprov",
                            linkedIdentities: {}, roles: [], language: view.language,
                        } });
                    }
                    return route.fulfill({ status: 204 });
                });
                await page.route("**/api/**", route => route.fulfill({ status: route.request().method() === "GET" ? 404 : 204 }));
                await page.route("**/push/**", route => route.fulfill({ status: 204 }));

                await page.goto(path);
                await expect(page.locator(".study-session")).toBeVisible({ timeout: 30_000 });
                await page.evaluate(() => window.document.fonts.ready);
                await expectSessionToFit(page);
                if (path.startsWith("/quiz/")) {
                    await page.locator(".quiz-actions > button").first().click();
                } else {
                    await page.locator(".flashcard-drag-wrapper").press("Enter");
                }
                await expectSessionToFit(page);
                const content = page.locator(
                    '.quiz-face[aria-hidden="false"] .quiz-main, .flashcard-face[aria-hidden="false"] .flashcard-main',
                );
                const bottomReachable = await content.evaluate(element => {
                    element.scrollTop = element.scrollHeight;
                    return element.scrollHeight - element.scrollTop <= element.clientHeight + 1;
                });
                expect(bottomReachable).toBe(true);
                await expectSessionToFit(page);
                if (view.name === "phone" && path === "/flashcard/words") {
                    // Browser toolbars can take height back while studying.
                    await page.setViewportSize({ width: view.width, height: view.height - 80 });
                    await expectSessionToFit(page);
                    await page.setViewportSize({ width: view.width, height: view.height });
                }
                if (path.startsWith("/quiz/")) {
                    await page.locator(".quiz-actions > button").click();
                    await expectSessionToFit(page);
                } else {
                    await page.locator(".flashcard-drag-wrapper").press("ArrowLeft");
                    await expect(page.locator(".flashcard-swipe-guide")).toHaveCount(0);
                    await expectSessionToFit(page);
                    await page.reload();
                    await expect(page.locator(".study-session")).toBeVisible({ timeout: 30_000 });
                    await page.evaluate(() => window.document.fonts.ready);
                    await expect(page.locator(".flashcard-swipe-guide")).toHaveCount(0);
                    await expectSessionToFit(page);
                }
            });
        }
    });
}
