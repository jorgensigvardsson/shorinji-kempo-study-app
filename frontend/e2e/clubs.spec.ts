import { expect, test } from "@playwright/test";
import { CURRENT_VERSION } from "../src/changelog-entries";

const federationName = "Svenska Shorinji Kempoförbundet";
const branches = [
  { id: "b-karlstad", name: "Shorinji Kempo Karlstad Shibu", federationId: "SE", federationName },
  { id: "b-goteborg", name: "Shorinji Kempo Göteborg Shibu", federationId: "SE", federationName },
  { id: "b-tokyo", name: "Tokyo Honbu" },
];

const views = [
  { name: "mobile", width: 390, height: 844, theme: "light", textSize: 1, roles: [] },
  { name: "narrow mobile", width: 320, height: 800, theme: "dark", textSize: 1.4, roles: ["branch_admin:b-karlstad"] },
  { name: "desktop", width: 1280, height: 1000, theme: "light", textSize: 1, roles: ["admin"] },
] as const;

for (const view of views) {
  test.describe(`Clubs: ${view.name}`, () => {
    test.use({
      viewport: { width: view.width, height: view.height }, colorScheme: view.theme,
      ignoreHTTPSErrors: true, serviceWorkers: "block",
    });

    test("combines the own branch, transfers and directory while preserving old links", async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const userInfo = {
        id: "00000000-0000-4000-8000-000000000004", email: "clubs@example.invalid",
        displayName: "Klubbprov", branchId: "b-karlstad", linkedIdentities: {},
        roles: [...view.roles], language: "sv",
      };
      await page.addInitScript(({ userInfo, theme, textSize, version }) => {
        localStorage.setItem("sync-provider", "backend");
        localStorage.setItem("sync-backend-user", JSON.stringify(userInfo));
        localStorage.setItem("theme-preference", theme);
        localStorage.setItem("text-size", JSON.stringify(textSize));
        localStorage.setItem("lastSeenVersion", version);
        localStorage.setItem("notifications-prompt-dismissed", "true");
      }, { userInfo, theme: view.theme, textSize: view.textSize, version: CURRENT_VERSION });

      let transfer: { toBranchId: string; toBranchName: string; status: string; createdAt: string } | null = null;
      let submitted: unknown;
      await page.route("**/auth/**", route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/auth/me") return route.fulfill({ json: userInfo });
        if (path === "/auth/org/branches") return route.fulfill({ json: branches });
        if (path === "/auth/admin/org") return route.fulfill({ json: {
          federations: [{ id: "SE", name: federationName, branches: [{ id: branches[0].id, name: branches[0].name, memberCount: 15 }] }],
          wskoBranches: [],
        } });
        if (path === "/auth/admin/requests" || path === "/auth/admin/transfers") return route.fulfill({ json: [] });
        if (path === "/auth/transfer") {
          if (route.request().method() === "POST") {
            submitted = route.request().postDataJSON();
            transfer = { toBranchId: branches[1].id, toBranchName: branches[1].name, status: "pending", createdAt: "2026-11-22T00:00:00Z" };
          } else if (route.request().method() === "DELETE") {
            transfer = null;
          }
          return route.request().method() === "GET" && transfer !== null
            ? route.fulfill({ json: transfer }) : route.fulfill({ status: 204 });
        }
        return route.fulfill({ status: 204 });
      });
      await page.route("**/api/**", route => route.fulfill({ status: route.request().method() === "GET" ? 404 : 204 }));
      await page.route("**/push/**", route => route.fulfill({ status: 204 }));

      await page.goto("/branch");
      await expect(page).toHaveURL(/\/clubs$/);
      await expect(page.getByRole("heading", { level: 1, name: "Klubbar och förbund" })).toBeVisible();
      const own = page.getByRole("region", { name: "Min klubb", exact: true });
      const directory = page.getByRole("region", { name: "Alla klubbar och förbund" });
      await expect(own.getByText(branches[0].name, { exact: true })).toBeVisible();
      expect(await own.evaluate((element) => {
        const directory = document.querySelector(".clubs-directory")!;
        return !!(element.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING);
      })).toBe(true);
      const changeBranch = own.getByRole("button", { name: "Byt klubb", exact: true });
      await expect(changeBranch).toHaveAttribute("aria-expanded", "false");
      await expect(own.getByRole("combobox", { name: "Klubb", exact: true })).toBeHidden();
      const federation = directory.getByRole("button", { name: new RegExp(federationName) });
      await expect(federation).toHaveAttribute("aria-expanded", "false");
      const manage = own.getByRole("link", { name: "Administrera klubben" });
      if (view.roles.length) {
        await expect(manage).toHaveAttribute("href", "/admin/branches/b-karlstad/members");
        await expect(directory.getByText("Antalen visar registrerade användare i appen.")).toBeVisible();
      } else {
        await expect(manage).toHaveCount(0);
        await expect(directory.getByTestId("member-count")).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("clubs.png"), fullPage: true });

      await federation.click();
      await expect(directory.getByText("Din klubb", { exact: true })).toBeVisible();
      await expect(directory.getByRole("link", { name: "Visa förbundet" })).toHaveAttribute("href", "/admin/federations/SE");
      if (!view.roles.length) await expect(directory.getByRole("link", { name: branches[0].name, exact: true })).toHaveCount(0);

      await changeBranch.click();
      const picker = own.getByRole("combobox", { name: "Klubb", exact: true });
      await expect(picker.locator('option[value="b-karlstad"]')).toHaveCount(0);
      await picker.selectOption("b-goteborg");
      await own.getByLabel("Meddelande (frivilligt)").fill(" Jag har flyttat ");
      await own.getByRole("button", { name: "Skicka ansökan", exact: true }).click();
      await expect(own.getByRole("status")).toContainText("Du har ansökt om att byta till");
      expect(submitted).toEqual({ toBranchId: "b-goteborg", note: "Jag har flyttat" });
      await page.reload();
      await expect(own.getByRole("status")).toContainText("Du har ansökt om att byta till");
      await expect(own.getByRole("button", { name: "Byt klubb", exact: true })).toHaveCount(0);
      await own.getByRole("button", { name: "Ta tillbaka ansökan" }).click();
      await expect(changeBranch).toHaveAttribute("aria-expanded", "false");

      await page.getByRole("button", { name: "Träd", exact: true }).click();
      await expect(page.getByTestId("rf__node-b-karlstad")).toBeVisible();
      await expect(directory.getByText("Din klubb", { exact: true })).toBeVisible();
      await page.goto("/admin/organization");
      await expect(page).toHaveURL(/\/clubs$/);
      await expect(page.getByRole("button", { name: "Träd", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(own.getByText(branches[0].name, { exact: true })).toBeVisible();

      await page.locator(view.width < 992 ? ".app-bottom-nav button" : "#desktop-more-menu").click();
      const menu = page.locator(view.width < 992 ? ".offcanvas.show" : ".dropdown-menu.show");
      await expect(menu.getByRole("link", { name: "Klubbar och förbund", exact: true })).toHaveCount(1);
      await expect(menu.getByRole("link", { name: "Min klubb", exact: true })).toHaveCount(0);
      await expect(menu.getByRole("link", { name: "Organisation", exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
