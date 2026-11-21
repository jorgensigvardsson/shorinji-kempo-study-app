import { expect, test } from "@playwright/test";
import { CURRENT_VERSION } from "../src/changelog-entries";

const views = [
    { name: "mobile", width: 390, height: 844, colorScheme: "light", textSize: 1 },
    { name: "narrow mobile with large text", width: 320, height: 800, colorScheme: "dark", textSize: 1.4 },
    { name: "desktop", width: 1280, height: 1000, colorScheme: "dark", textSize: 1 },
] as const;

for (const view of views) {
    test.describe(`Getting started: ${view.name}`, () => {
        test.use({
            viewport: { width: view.width, height: view.height },
            colorScheme: view.colorScheme,
            hasTouch: view.width < 992,
            isMobile: view.width < 992,
            ignoreHTTPSErrors: true,
            serviceWorkers: "block",
        });

        test("keeps dismissal after a fresh account loads and Help remains reachable", async ({ page }) => {
            const errors: string[] = [];
            page.on("pageerror", error => errors.push(error.message));
            await page.addInitScript(({ theme, textSize, version }) => {
                localStorage.setItem("sync-provider", "backend");
                localStorage.setItem("theme-preference", theme);
                localStorage.setItem("text-size", JSON.stringify(textSize));
                localStorage.setItem("lastSeenVersion", version);
                localStorage.setItem("notifications-prompt-dismissed", "true");
            }, { theme: view.colorScheme, textSize: view.textSize, version: CURRENT_VERSION });

            // Start without cached user info: the account becomes known asynchronously.
            // This also exercises the React compiler, which the unit-test build omits.
            await page.route("**/auth/**", route => {
                if (new URL(route.request().url()).pathname === "/auth/me") {
                    return route.fulfill({ json: {
                        id: "00000000-0000-4000-8000-000000000002",
                        email: "guide@example.invalid",
                        displayName: "Guideprov",
                        linkedIdentities: {}, roles: [], language: "sv",
                    } });
                }
                return route.fulfill({ status: 204 });
            });
            await page.route("**/api/**", route => route.fulfill({ status: route.request().method() === "GET" ? 404 : 204 }));
            await page.route("**/push/**", route => route.fulfill({ status: 204 }));

            await page.goto("/");
            await expect(page.getByLabel("Gasshō, Guideprov", { exact: true })).toBeVisible();
            const welcome = page.getByRole("complementary", { name: "Kom igång med appen" });
            await expect(welcome).toBeVisible();
            await expect(welcome).toContainText("Aktivera gärna pushnotiser för nyheter om appen.");
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

            await page.getByRole("link", { name: "Öppna guiden", exact: true }).click();
            await expect(page.getByRole("heading", { level: 1, name: "Kom igång med appen" })).toBeVisible();
            await page.getByRole("button", { name: "Tillbaka", exact: true }).click();
            await expect(welcome).toBeVisible();

            await page.getByRole("button", { name: "Ta bort Kom igång från startsidan" }).click();
            const notice = page.getByRole("dialog", { name: "Hjälpen finns kvar" });
            await expect(notice).toBeVisible();
            await expect(notice).toContainText("Öppna menyn Mer och välj Hjälp");
            await notice.getByRole("button", { name: "OK", exact: true }).click();
            await expect(notice).toBeHidden();
            await expect(welcome).toHaveCount(0);

            await page.reload();
            await expect(page.getByLabel("Gasshō, Guideprov", { exact: true })).toBeVisible();
            await expect(welcome).toHaveCount(0);

            if (view.width < 992) {
                await page.locator(".app-bottom-nav").getByRole("button", { name: "Mer", exact: true }).click();
                await page.locator(".offcanvas.show").getByRole("link", { name: "Hjälp", exact: true }).click();
            } else {
                await page.locator("#desktop-more-menu").click();
                await page.locator(".dropdown-menu.show").getByRole("link", { name: "Hjälp", exact: true }).click();
            }
            await expect(page.getByRole("heading", { level: 1, name: "Kom igång med appen" })).toBeVisible();
            await expect(page.getByText(/^Gradinställningen hjälper appen/)).toBeVisible();
            await page.getByRole("button", { name: "Hokei – din teknikträning", exact: true }).click();
            await expect(page.getByText(/^Teknikinnehållet i Hokei och veckoplanen kommer från Kamokuhyō/)).toBeVisible();

            for (const title of ["Quiz", "Flashkort"]) {
                const topic = page.getByRole("button", { name: title, exact: true });
                await topic.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
                await topic.click();
                await expect(page.locator(".help-page").getByRole("link", { name: title, exact: true })).toBeVisible();
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const notificationsTopic = page.getByRole("button", { name: "Nyheter via pushnotiser", exact: true });
            await notificationsTopic.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
            await notificationsTopic.click();
            const settingsLink = page.getByRole("link", { name: "Inställningar för notiser", exact: true });
            await settingsLink.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
            await settingsLink.click();
            await expect(page.getByRole("heading", { level: 1, name: "Inställningar", exact: true })).toBeVisible();
            expect(errors).toEqual([]);
        });
    });
}
