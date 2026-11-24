import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { NavigationMemoryProvider } from "./navigation-memory";
import { BrowserStateScope, isText, useBrowserState } from "./browser-state";
import { activities, mainSection } from "./navigation";
import { searchScore, techniqueCatalogue } from "./activity-search";
import ActivitySearch from "./ActivitySearch";
import ShortcutSettings from "./ShortcutSettings";
import Start from "./Start";
import Technique from "./Technique";
import BackButton from "./components/BackButton";
import RouteContent from "./components/RouteContent";
import { getRoutes } from "./routes";
import type { GradePlan, HokeiMoment } from "./data";
import { TranslatorContext, TranslatorImplementation } from "./i18n";
import en from "./assets/translations.en.json";
import ja from "./assets/translations.ja.json";
import tr from "./assets/translations.tr.json";

const hokei: HokeiMoment = {
    id: "tsuki nuki [soto]", type: "hokei_moment", hokei_name: "tsuki nuki", variations: ["soto"],
    technique_group: "ryūō ken", roles: { attacker: {}, defender: {} }, foot_stance: [], kyohan_pages: [], ren_hanko: false,
};
const plans: GradePlan[] = [{ grade: "6 kyū", weeks: [{ week: 1, type: "regular_week", kihon_shoho: [], moments: [
    hokei, { ...hokei, id: "tsuki nuki [uchi]", variations: ["uchi"] },
] }] }];

vi.mock("./components/HokeiCard", () => ({
    default: ({ hokei, showNotes, showRating, defaultOpen }: { hokei: HokeiMoment; showNotes: boolean; showRating: boolean; defaultOpen: boolean }) =>
        <div data-testid="technique-card" data-id={hokei.id} data-notes={showNotes} data-rating={showRating} data-open={defaultOpen} />,
}));

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, ""); });

function Probe() {
    const location = useLocation();
    return <>
        <output data-testid="url">{location.pathname}{location.search}</output>
        <Link to="/">Home</Link><Link to="/settings">Settings</Link>
    </>;
}

function Harness({ account = "one" }: { account?: string }) {
    return <NavigationMemoryProvider account={account}>
        <Probe />
        <Routes>
            <Route path="/" element={<Start routes={[]} />} />
            <Route path="/search" element={<ActivitySearch allGradePlans={plans} />} />
            <Route path="/shortcuts" element={<ShortcutSettings />} />
            <Route path="/technique/:id" element={<Technique allGradePlans={plans} />} />
            <Route path="*" element={<div>Activity</div>} />
        </Routes>
    </NavigationMemoryProvider>;
}

describe("navigation shortcuts", () => {
    it("pins a feature through Customize and keeps it on this account's start page after remounting", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<MemoryRouter><Harness /></MemoryRouter>);
        await user.click(screen.getByRole("link", { name: "Anpassa" }));
        expect(screen.getByRole("heading", { level: 1, name: "Anpassa genvägar" })).toBeTruthy();
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.queryByRole("group", { name: /Filtrera sökresultat/ })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Lägg till genväg till Flashkort ordlista" }));
        expect(screen.getByRole("button", { name: "Ta bort genväg till Flashkort ordlista" }).getAttribute("aria-pressed")).toBe("true");
        await user.click(screen.getByRole("button", { name: "Tillbaka" }));
        expect(screen.getByRole("link", { name: "Flashkort ordlista" }).getAttribute("href")).toBe("/flashcard/words");
        expect(localStorage.getItem("navigation:one:recent")).toBeNull();
        unmount();
        const restored = render(<MemoryRouter><Harness /></MemoryRouter>);
        expect(screen.getByRole("link", { name: "Flashkort ordlista" })).toBeTruthy();
        restored.unmount();
        render(<MemoryRouter><Harness account="two" /></MemoryRouter>);
        expect(screen.queryByRole("link", { name: "Flashkort ordlista" })).toBeNull();
    });

    it("connects the separate customization page to Start without adding a menu entry", async () => {
        const translator = new TranslatorImplementation({ en, ja, tr }, "sv");
        const routes = getRoutes(plans[0], plans[0], "minarai", plans, translator, 1, () => {}, () => {}, () => {}, false);
        const shortcuts = routes.find(route => route.path === "/shortcuts");
        expect(shortcuts?.element).toBeTruthy();
        expect(shortcuts?.hideFromMenu).toBe(true);
        expect(shortcuts?.hideOnStartPage).toBe(true);
        expect(mainSection("/shortcuts")).toBe("/");
        const user = userEvent.setup();
        render(<MemoryRouter><NavigationMemoryProvider account="one">
            <RouteContent routes={routes} translator={translator} />
        </NavigationMemoryProvider></MemoryRouter>);
        await user.click(screen.getByRole("link", { name: "Anpassa" }));
        expect(await screen.findByRole("heading", { name: "Anpassa genvägar" })).toBeTruthy();
        await user.click(screen.getByRole("link", { name: "Start" }));
        expect(screen.getByRole("heading", { name: "Vad vill du göra idag?" })).toBeTruthy();
    });

    it("keeps an intentionally empty shortcut selection after returning home and remounting", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<MemoryRouter><Harness /></MemoryRouter>);
        await user.click(screen.getByRole("link", { name: "Anpassa" }));
        for (const title of ["Veckans träning", "Hokei", "Träna gradering"]) {
            await user.click(screen.getByRole("button", { name: `Ta bort genväg till ${title}` }));
        }
        await user.click(screen.getByRole("link", { name: "Start" }));
        expect(screen.getByText("Tryck på Anpassa och stjärnmarkera de funktioner du vill ha här.")).toBeTruthy();
        expect(localStorage.getItem("navigation:one:pins")).toBe("[]");
        unmount();
        render(<MemoryRouter><Harness /></MemoryRouter>);
        expect(within(screen.getByRole("region", { name: "Mina genvägar" })).getAllByRole("link")).toHaveLength(1);
        expect(screen.getByText("Tryck på Anpassa och stjärnmarkera de funktioner du vill ha här.")).toBeTruthy();
    });

    it("keeps the existing language restrictions on shortcut choices", () => {
        render(<TranslatorContext.Provider value={new TranslatorImplementation({ en, ja, tr }, "ja")}>
            <MemoryRouter><NavigationMemoryProvider account="one"><ShortcutSettings /></NavigationMemoryProvider></MemoryRouter>
        </TranslatorContext.Provider>);
        expect(screen.getByRole("heading", { name: ja["Anpassa genvägar"] })).toBeTruthy();
        expect(screen.getByRole("button", { name: new RegExp(ja["Veckans träning"]) })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /用語のフラッシュカード/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /用語のフラッシュカード/ })).toBeNull();
    });

    it("returns home without a resume button or recording recent activities", async () => {
        const user = userEvent.setup();
        const url = "/training/grading?gradingCategory=6+ky%C5%AB%7C0%7C1";
        render(<MemoryRouter initialEntries={[url]}><Harness /></MemoryRouter>);
        await user.click(screen.getByRole("link", { name: "Settings" }));
        await user.click(screen.getByRole("link", { name: "Home" }));
        expect(screen.getByTestId("url").textContent).toBe("/");
        expect(screen.queryByRole("button", { name: /Fortsätt där du slutade/ })).toBeNull();
        expect(screen.getByRole("region", { name: "Mina genvägar" })).toBeTruthy();
        expect(localStorage.getItem("navigation:one:recent")).toBeNull();
    });

    it("ignores old recent activities and falls back to default shortcuts when their storage is damaged", async () => {
        localStorage.setItem("navigation:one:pins", "not json");
        const oldRecent = JSON.stringify([{ url: "/kamoku/plan", grade: "3 kyū" }]);
        localStorage.setItem("navigation:one:recent", oldRecent);
        const user = userEvent.setup();
        render(<MemoryRouter><Harness /></MemoryRouter>);
        expect(screen.getByRole("link", { name: "Veckans träning" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /Fortsätt där du slutade/ })).toBeNull();
        await user.click(screen.getByRole("link", { name: "Hokei" }));
        await user.click(screen.getByRole("link", { name: "Home" }));
        expect(screen.queryByRole("button", { name: /Fortsätt där du slutade/ })).toBeNull();
        expect(localStorage.getItem("navigation:one:recent")).toBe(oldRecent);
    });
});

describe("app search", () => {
    it.each(["all", "functions", "techniques", "words"])("waits for a search term with the %s filter", kind => {
        render(<MemoryRouter initialEntries={[`/search?kind=${kind}&q=+++`]}><ActivitySearch allGradePlans={plans} /></MemoryRouter>);
        expect(screen.getByText("Skriv ett ord för att söka.")).toBeTruthy();
        expect(screen.queryByRole("region")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByRole("button", { name: /genväg till/ })).toBeNull();
    });

    it("finds functions without shortcut controls and hides the results again when cleared", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={["/search"]}><Harness /></MemoryRouter>);
        const field = screen.getByRole("searchbox");
        await user.type(field, "flashkort");
        expect(screen.getByRole("region", { name: "Funktioner" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /genväg till/ })).toBeNull();
        const flashcards = screen.getByRole("link", { name: /Flashkort hokei/ });
        expect(flashcards.getAttribute("href")).toBe("/flashcard/hokei");
        await user.clear(field);
        expect(screen.queryByRole("region")).toBeNull();
        expect(screen.getByText("Skriv ett ord för att söka.")).toBeTruthy();
        await user.type(field, "flashkort");
        await user.click(screen.getByRole("link", { name: /Flashkort hokei/ }));
        expect(screen.getByTestId("url").textContent).toBe("/flashcard/hokei");
        expect(localStorage.getItem("navigation:one:pins")).toBeNull();
    });

    it("searches unaccented romaji and keeps variations distinct through a deep link", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={["/search?q=ryuo"]}><Harness /></MemoryRouter>);
        const results = screen.getByRole("region", { name: /Hokei/ });
        expect(within(results).getAllByRole("link")).toHaveLength(2);
        await user.click(within(results).getByRole("link", { name: /Tsuki nuki \(soto\)/ }));
        const card = screen.getByTestId("technique-card");
        expect(card.getAttribute("data-id")).toBe("tsuki nuki [soto]");
        expect(card.getAttribute("data-notes")).toBe("true");
        expect(card.getAttribute("data-rating")).toBe("true");
        expect(card.getAttribute("data-open")).toBe("true");
        await user.click(screen.getByRole("button", { name: "Tillbaka" }));
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("ryuo");
    });

    it("finds functions by their translated name and hides language tools in Japanese", () => {
        render(<TranslatorContext.Provider value={new TranslatorImplementation({ en, ja }, "ja")}>
            <MemoryRouter initialEntries={["/search?q=実技"]}><ActivitySearch allGradePlans={plans} /></MemoryRouter>
        </TranslatorContext.Provider>);
        expect(screen.getByRole("link", { name: /実技の昇格考試/ })).toBeTruthy();
        expect(screen.queryByRole("link", { name: /用語のフラッシュカード/ })).toBeNull();
    });

    it("finds Swedish meanings in the word list", () => {
        render(<MemoryRouter initialEntries={["/search?q=hand&kind=words"]}><ActivitySearch allGradePlans={plans} /></MemoryRouter>);
        expect(screen.getByRole("region", { name: /Ordlista/ })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Funktioner" })).toBeNull();
    });

    it("keeps both variations and ranks exact names ahead of partial matches", () => {
        expect(techniqueCatalogue(plans).map(entry => entry.hokei.id)).toEqual(["tsuki nuki [soto]", "tsuki nuki [uchi]"]);
        expect(searchScore("ryuo", "ryūō ken")).toBeGreaterThan(0);
        expect(searchScore("gyaku gote", "gyaku gote")).toBeGreaterThan(searchScore("gyaku gote", "gyaku gote ren hankō"));
        expect(searchScore("soto nuki", "tsuki nuki", ["soto"])).toBeGreaterThan(0);
    });

    it("has translations for all shortcut labels", () => {
        for (const language of [en, ja, tr]) for (const activity of activities)
            expect((language as Record<string, string>)[activity.title], activity.title).toBeTruthy();
    });

    it.each(["/word-list", "/quiz/words", "/flashcard/hokei", "/theory/grading"])("keeps Theory selected at %s", path => {
        expect(mainSection(path)).toBe("/theory");
    });
});

it("keeps a view filter after remount, but does not carry it to another account", async () => {
    function Filter() {
        const [value, setValue] = useBrowserState("query", "", isText);
        return <input aria-label="Filter" value={value} onChange={event => setValue(event.target.value)} />;
    }
    const user = userEvent.setup();
    const first = render(<BrowserStateScope.Provider value="one"><Filter /></BrowserStateScope.Provider>);
    await user.type(screen.getByRole("textbox"), "gyaku");
    first.unmount();
    const second = render(<BrowserStateScope.Provider value="one"><Filter /></BrowserStateScope.Provider>);
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("gyaku");
    second.rerender(<BrowserStateScope.Provider value="two"><Filter /></BrowserStateScope.Provider>);
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("");
});

it("gives a fresh deep link a useful back destination", async () => {
    window.history.replaceState({ idx: 0 }, "");
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/technique/unknown"]}><BackButton fallback="/search" /><Probe /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByTestId("url").textContent).toBe("/search");
});
