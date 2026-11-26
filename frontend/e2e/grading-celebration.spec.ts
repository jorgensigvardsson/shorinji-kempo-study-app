import { expect, test } from "@playwright/test";
import { CURRENT_VERSION } from "../src/changelog-entries";
import { createDefaultAppDataDocument } from "../src/persistence/schema";

const views = [
    { name: "mobile", width: 390, height: 844, theme: "light", textSize: 1, reducedMotion: "no-preference" },
    { name: "large text, reduced motion", width: 320, height: 800, theme: "dark", textSize: 1.4, reducedMotion: "reduce" },
    { name: "desktop", width: 1280, height: 900, theme: "dark", textSize: 1, reducedMotion: "no-preference" },
] as const;

for (const view of views) {
    test.describe(`Grading celebration: ${view.name}`, () => {
        test.use({ viewport: view, colorScheme: view.theme, reducedMotion: view.reducedMotion,
            ignoreHTTPSErrors: true, serviceWorkers: "block" });

        test("saves the new grade, preserves study progress and celebrates again safely", async ({ page }, testInfo) => {
            const errors: string[] = [];
            page.on("pageerror", error => errors.push(error.message));
            const userInfo = { id: "00000000-0000-4000-8000-000000000009", email: "celebration@example.invalid",
                displayName: "Konfettiprov", linkedIdentities: {}, providers: ["email"], roles: [], language: "sv" };
            let document = createDefaultAppDataDocument();
            document.data.currentGrade = "1 kyū";
            document.data.grade = "shodan";
            document.data.notes = { "tsuki nuki [soto]": "Min anteckning" };
            document.data.hokeiRanks = { "tsuki nuki [soto]": { value: 2, updatedAt: document.updatedAt } };
            document.data.gradingTheoryCompletions = { "1 kyū|preview": { completedAt: document.updatedAt } };
            const original = structuredClone(document.data);
            await page.addInitScript(({ userInfo, document, version, view }) => {
                localStorage.setItem("sync-provider", "backend");
                localStorage.setItem("sync-backend-user", JSON.stringify(userInfo));
                localStorage.setItem("app-data-document", JSON.stringify(document));
                localStorage.setItem("lastSeenVersion", version);
                localStorage.setItem("notifications-prompt-dismissed", "true");
                localStorage.setItem("theme-preference", view.theme);
                localStorage.setItem("text-size", JSON.stringify(view.textSize));
            }, { userInfo, document, version: CURRENT_VERSION, view });
            await page.route("**/auth/**", route => new URL(route.request().url()).pathname === "/auth/me"
                ? route.fulfill({ json: userInfo }) : route.fulfill({ status: 204 }));
            await page.route("**/api/**", route => {
                if (route.request().method() === "PUT") document = route.request().postDataJSON();
                return route.fulfill({ json: document, headers: { ETag: '"preview"' } });
            });
            await page.route("**/push/**", route => route.fulfill({ status: 204 }));
            await page.goto("/");
            await expect(page.getByRole("heading", { level: 1, name: "Vad vill du göra idag?" })).toBeVisible();
            await expect(page.getByRole("button", { name: "Jag har klarat min gradering!", exact: true })).toHaveCount(0);
            await page.goto("/settings");
            const start = page.getByRole("region", { name: "Om mig", exact: true })
                .getByRole("button", { name: "Jag har klarat min gradering!", exact: true });
            await start.click();
            const dialog = page.getByRole("dialog");
            await expect(dialog).toContainText("Har du klarat graderingen till Shodan?");
            await dialog.getByRole("button", { name: "Avbryt" }).click();
            await expect(dialog).toBeHidden();
            expect(document.data.currentGrade).toBe("1 kyū");

            await start.click();
            await dialog.getByRole("button", { name: "Ja, jag har klarat den!" }).click();
            await expect(dialog).toContainText("Grattis till din nya grad!");
            await expect(dialog.getByRole("status")).toContainText("Shodan");
            await expect.poll(() => document.data.currentGrade).toBe("shodan");
            expect(document.data.grade).toBe("nidan");
            expect(document.data.notes).toEqual(original.notes);
            expect(document.data.hokeiRanks).toEqual(original.hokeiRanks);
            expect(document.data.gradingTheoryCompletions).toEqual(original.gradingTheoryCompletions);
            await dialog.getByRole("button", { name: "Fira igen!" }).click();
            expect(document.data.currentGrade).toBe("shodan");
            const confetti = page.locator(".grading-confetti");
            if (view.reducedMotion === "reduce") await expect(confetti).toBeHidden();
            else {
                await expect(confetti).toBeVisible();
                await expect.poll(() => confetti.locator("span").evaluateAll(pieces => pieces.some(piece => {
                    const bounds = piece.getBoundingClientRect();
                    return Number(getComputedStyle(piece).opacity) > 0
                        && bounds.top > 0 && bounds.bottom < innerHeight;
                }))).toBe(true);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const bounds = (await dialog.locator(".modal-content").boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(view.width);
            await page.screenshot({ path: testInfo.outputPath("celebration.png") });
            await dialog.locator(".modal-footer").getByRole("button", { name: "Stäng", exact: true }).click();
            await expect(dialog).toBeHidden();
            await expect(confetti).toHaveCount(0);
            await expect(page.getByLabel("Min grad", { exact: true })).toContainText("Shodan");
            await start.click();
            await expect(dialog).toContainText("Har du klarat graderingen till Nidan?");
            expect(errors).toEqual([]);
        });
    });
}
