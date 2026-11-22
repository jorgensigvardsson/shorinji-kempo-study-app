import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_VERSION } from "../src/changelog-entries";
import { createDefaultAppDataDocument } from "../src/persistence/schema";

const views = [
  { name: "mobile", width: 390, height: 844, theme: "light", textSize: 1 },
  { name: "narrow mobile with large text", width: 320, height: 800, theme: "dark", textSize: 1.4 },
  { name: "desktop", width: 1280, height: 1000, theme: "light", textSize: 1 },
] as const;

for (const view of views) {
  test.describe(`Settings: ${view.name}`, () => {
    test.use({
      viewport: { width: view.width, height: view.height }, colorScheme: view.theme,
      ignoreHTTPSErrors: true, serviceWorkers: "block",
    });

    test("keeps preferences, sign-in and the two export formats usable", async ({ page }, testInfo) => {
      const errors: string[] = [];
      let deletions = 0;
      page.on("pageerror", error => errors.push(error.message));
      const userInfo = {
        id: "00000000-0000-4000-8000-000000000005", email: "settings@example.invalid",
        displayName: "Inställningsprov", branchId: "preview", linkedIdentities: { email: { email: "settings@example.invalid" } },
        providers: ["email"], roles: [], language: "sv",
      };
      let document = createDefaultAppDataDocument();
      document.data.notes = { "preview-technique": "Min sparade anteckning" };
      await page.addInitScript(({ userInfo, document, theme, textSize, version }) => {
        localStorage.setItem("sync-provider", "backend");
        localStorage.setItem("sync-backend-user", JSON.stringify(userInfo));
        localStorage.setItem("app-data-document", JSON.stringify(document));
        localStorage.setItem("theme-preference", theme);
        localStorage.setItem("text-size", JSON.stringify(textSize));
        localStorage.setItem("lastSeenVersion", version);
        localStorage.setItem("notifications-prompt-dismissed", "true");
      }, { userInfo, document, theme: view.theme, textSize: view.textSize, version: CURRENT_VERSION });
      await page.route("**/auth/**", route => {
        if (route.request().method() === "DELETE") deletions += 1;
        if (new URL(route.request().url()).pathname === "/auth/me") return route.fulfill({ json: userInfo });
        return route.fulfill({ status: 204 });
      });
      await page.route("**/api/**", route => {
        if (route.request().method() === "PUT") document = route.request().postDataJSON();
        return route.fulfill({ json: document, headers: { ETag: '"preview"' } });
      });
      await page.route("**/push/**", route => route.fulfill({ status: 204 }));

      await page.goto("/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Inställningar" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "Om mig", "Anpassa appen", "Dina uppgifter", "Felsökning",
      ]);
      await expect(page.getByText(userInfo.email, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ta bort inloggningssätt" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });

      const toggles = page.locator(".settings-dropdown .dropdown-toggle");
      await expect(toggles).toHaveCount(4);
      for (const toggle of await toggles.all()) {
        await toggle.click();
        const menu = page.locator(".settings-dropdown .dropdown-menu.show");
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
        await page.keyboard.press("Escape");
      }

      const data = page.getByRole("region", { name: "Dina uppgifter" });
      await expect(data.getByRole("button", { name: "Logga ut", exact: true })).toBeVisible();
      const signIn = data.getByRole("button", { name: "Konto och inloggning", exact: true });
      await expect(signIn).toHaveAttribute("aria-expanded", "false");
      await signIn.click();
      const account = data.locator(".settings-account");
      const addMethod = account.getByRole("button", { name: "Lägg till inloggningssätt", exact: true });
      await expect(addMethod).toHaveAttribute("aria-expanded", "false");
      await addMethod.click();
      await expect(account.getByLabel("E-postadress")).toBeVisible();
      await addMethod.click();
      await expect(account.getByLabel("E-postadress")).toBeHidden();
      await account.getByRole("button", { name: "Logga ut på alla andra enheter" }).click();
      await expect(account.getByText("Du har loggats ut på alla andra enheter.")).toBeVisible();

      const backup = data.getByRole("button", { name: "Säkerhetskopiera och återställ", exact: true });
      await expect(backup).toHaveAttribute("aria-expanded", "false");
      await backup.click();
      const [backupDownload] = await Promise.all([
        page.waitForEvent("download"),
        data.getByRole("button", { name: "Ladda ner säkerhetskopia", exact: true }).click(),
      ]);
      const backupPayload = JSON.parse(await readFile((await backupDownload.path())!, "utf8"));
      expect(backupPayload.data.notes["preview-technique"]).toBe("Min sparade anteckning");
      expect(backupPayload.userRecord).toBeUndefined();
      const [picker] = await Promise.all([
        page.waitForEvent("filechooser"),
        data.getByRole("button", { name: "Läs in säkerhetskopia", exact: true }).click(),
      ]);
      await picker.setFiles({
        name: "backup.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ ...backupPayload, data: { ...backupPayload.data, appDisplayName: "Återläst namn" } })),
      });
      await expect(page.getByLabel("Namn i appen")).toHaveValue("Återläst namn");

      await data.getByRole("button", { name: "Ladda ner kontouppgifter", exact: true }).click();
      const [accountDownload] = await Promise.all([
        page.waitForEvent("download"),
        data.getByRole("button", { name: "Ladda ner kontokopia", exact: true }).click(),
      ]);
      const accountPayload = JSON.parse(await readFile((await accountDownload.path())!, "utf8"));
      expect(accountPayload.userRecord.email).toBe(userInfo.email);
      expect(accountPayload.appData).toBeTruthy();

      await data.getByRole("button", { name: "Radera konto", exact: true }).click();
      await expect(data.getByText("Det här kan inte ångras.")).toBeVisible();
      await data.getByRole("button", { name: "Avbryt", exact: true }).click();
      expect(deletions).toBe(0);
      await expect(page.getByRole("heading", { name: "Installera om appen", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Installera om appen", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
