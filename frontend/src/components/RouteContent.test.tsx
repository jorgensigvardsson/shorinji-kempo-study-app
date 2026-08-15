import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lazy } from "react";
import { MemoryRouter, NavLink } from "react-router-dom";
import RouteContent from "./RouteContent";
import { TranslatorImplementation } from "../i18n";
import { House } from "react-bootstrap-icons";
import type { Route } from "../routes";
import { preloadPages } from "../routes";

// No translation table, so translate() hands back the Swedish source text and the
// assertions below read as the copy actually shipped.
const translator = new TranslatorImplementation({}, "sv");

const route = (path: string, component: React.ComponentType): Route =>
  ({ path, component, menuText: path, icon: House });

// React logs a rejected lazy import and the boundary catching it; that noise is the
// expected outcome here, not a signal.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => { consoleError = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { consoleError.mockRestore(); });

describe("RouteContent", () => {
  // A release deployed while a tab is open can leave the old build asking for chunks
  // that are no longer on the server. That must cost the page, not the application.
  it("keeps the rest of the app alive when a page's chunk fails to load", async () => {
    const Missing = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));

    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <nav data-testid="navbar">navbar</nav>
        <RouteContent routes={[route("/missing", Missing)]} translator={translator} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sidan kunde inte laddas. Ladda om appen och försök igen.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ladda om" })).toBeDefined();
    // The point of catching it here rather than at the root.
    expect(screen.getByTestId("navbar")).toBeDefined();
  });

  // The boundary is keyed on the path, so leaving a broken page is enough to clear
  // it — without that it would hold the error for the rest of the session.
  it("recovers when the user navigates to a page that does load", async () => {
    const user = userEvent.setup();
    const Missing = lazy(() => Promise.reject(new Error("chunk gone")));
    const Working = () => <div>fungerande sida</div>;

    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <NavLink to="/working">gå vidare</NavLink>
        <RouteContent
          routes={[route("/missing", Missing), route("/working", Working)]}
          translator={translator}
        />
      </MemoryRouter>,
    );

    await screen.findByText("Sidan kunde inte laddas. Ladda om appen och försök igen.");
    await user.click(screen.getByText("gå vidare"));

    expect(await screen.findByText("fungerande sida")).toBeDefined();
    expect(screen.queryByText("Sidan kunde inte laddas. Ladda om appen och försök igen.")).toBeNull();
  });

  it("renders a page that loads without complaint", async () => {
    const Page = lazy(() => Promise.resolve({ default: () => <div>sidan</div> }));

    render(
      <MemoryRouter initialEntries={["/page"]}>
        <RouteContent routes={[route("/page", Page)]} translator={translator} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("sidan")).toBeDefined();
  });
});

describe("preloadPages", () => {
  // Guards the two ways this goes wrong without anyone noticing: an import path that
  // no longer resolves, and an empty registry — which is what a page added with a
  // bare lazy() instead of page() would leave behind. Either would only show up as
  // navigation quietly going back to waiting on the network.
  it("loads every registered page", async () => {
    const pages = await preloadPages();

    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const page of pages) {
      expect((page as { default?: unknown }).default).toBeDefined();
    }
  });
});
