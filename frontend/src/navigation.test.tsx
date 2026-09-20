import { useContext, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { NavigationMemoryProvider } from "./navigation-memory";
import { NavigationMemory } from "./navigation-memory-context";
import { BrowserStateScope, isText, useBrowserState } from "./browser-state";
import { activities, mainSection } from "./navigation";
import { searchScore, techniqueCatalogue } from "./activity-search";
import ActivitySearch from "./ActivitySearch";
import Start from "./Start";
import Technique from "./Technique";
import BackButton from "./components/BackButton";
import type { GradeName, GradePlan, HokeiMoment } from "./data";
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
    const memory = useContext(NavigationMemory);
    const location = useLocation();
    return <>
        <output data-testid="url">{location.pathname}{location.search}</output>
        <output data-testid="recent">{JSON.stringify(memory.recent)}</output>
        <Link to="/">Home</Link><Link to="/settings">Settings</Link>
    </>;
}

function Harness({ account = "one" }: { account?: string }) {
    const [grade, setGrade] = useState<GradeName>("6 kyū");
    return <NavigationMemoryProvider account={account} grade={grade} allGradePlans={plans} onGradeChange={setGrade}>
        <Probe />
        <Routes>
            <Route path="/" element={<Start routes={[]} />} />
            <Route path="/search" element={<ActivitySearch allGradePlans={plans} />} />
            <Route path="/technique/:id" element={<Technique allGradePlans={plans} />} />
            <Route path="*" element={<div>Activity</div>} />
        </Routes>
    </NavigationMemoryProvider>;
}

describe("navigation shortcuts and resume", () => {
    it("pins a feature from search and keeps it on this account's start page after remounting", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<MemoryRouter initialEntries={["/search"]}><Harness /></MemoryRouter>);
        await user.click(screen.getByRole("button", { name: "Lägg till genväg till Ordflashkort" }));
        await user.click(screen.getByRole("link", { name: "Home" }));
        expect(screen.getByRole("link", { name: "Ordflashkort" }).getAttribute("href")).toBe("/flashcard/words");
        unmount();
        const restored = render(<MemoryRouter><Harness /></MemoryRouter>);
        expect(screen.getByRole("link", { name: "Ordflashkort" })).toBeTruthy();
        restored.unmount();
        render(<MemoryRouter><Harness account="two" /></MemoryRouter>);
        expect(screen.queryByRole("link", { name: "Ordflashkort" })).toBeNull();
    });

    it("resumes a grading category and does not replace it with the home or settings page", async () => {
        const user = userEvent.setup();
        const url = "/training/grading?gradingCategory=6+ky%C5%AB%7C0%7C1";
        render(<MemoryRouter initialEntries={[url]}><Harness /></MemoryRouter>);
        await user.click(screen.getByRole("link", { name: "Settings" }));
        await user.click(screen.getByRole("link", { name: "Home" }));
        await user.click(screen.getByRole("button", { name: /Fortsätt där du slutade/ }));
        expect(screen.getByTestId("url").textContent).toBe(url);
        expect(JSON.parse(screen.getByTestId("recent").textContent!)).toEqual([{ url, grade: "6 kyū" }]);
    });

    it("ignores damaged storage and restores a saved grade without changing the profile", async () => {
        localStorage.setItem("navigation:one:pins", "not json");
        localStorage.setItem("navigation:one:recent", JSON.stringify([{ url: "/kamoku/plan", grade: "3 kyū" }]));
        const user = userEvent.setup();
        render(<MemoryRouter><Harness /></MemoryRouter>);
        expect(screen.getByRole("link", { name: "Veckans träning" })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: /Fortsätt där du slutade/ }));
        expect(JSON.parse(screen.getByTestId("recent").textContent!)[0].grade).toBe("3 kyū");
    });
});

describe("app search", () => {
    it("searches unaccented romaji and keeps variations distinct through a deep link", async () => {
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={["/search?q=ryuo"]}><Harness /></MemoryRouter>);
        const results = screen.getByRole("region", { name: /Tekniker/ });
        expect(within(results).getAllByRole("link")).toHaveLength(2);
        await user.click(within(results).getByRole("link", { name: /Tsuki nuki \(soto\)/ }));
        const card = screen.getByTestId("technique-card");
        expect(card.getAttribute("data-id")).toBe("tsuki nuki [soto]");
        expect(card.getAttribute("data-notes")).toBe("true");
        expect(card.getAttribute("data-rating")).toBe("true");
        expect(card.getAttribute("data-open")).toBe("true");
        await user.click(screen.getByRole("button", { name: "Tillbaka" }));
        expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("ryuo");
        await user.click(screen.getByRole("link", { name: "Home" }));
        await user.click(screen.getByRole("button", { name: /Fortsätt där du slutade.*tsuki nuki \(soto\)/ }));
        expect(screen.getByTestId("technique-card").getAttribute("data-id")).toBe("tsuki nuki [soto]");
    });

    it("finds functions by their translated name and hides language tools in Japanese", () => {
        render(<TranslatorContext.Provider value={new TranslatorImplementation({ en, ja }, "ja")}>
            <MemoryRouter initialEntries={["/search"]}><ActivitySearch allGradePlans={plans} /></MemoryRouter>
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
