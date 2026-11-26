import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KamaeFlashcard from "./KamaeFlashcard";
import { kamaeFlashcards } from "./kamae-flashcards";
import { BrowserStateScope } from "./browser-state";
import { getAppDataStore } from "./persistence/store";
import en from "./assets/translations.en.json";
import ja from "./assets/translations.ja.json";
import tr from "./assets/translations.tr.json";

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    getAppDataStore().set("knownFlashCards", {});
    vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

it("offers both complete source families and the audited six-card kyū selection", () => {
    expect(kamaeFlashcards).toHaveLength(17);
    expect(new Set(kamaeFlashcards.map(card => card.node.id)).size).toBe(17);
    expect(kamaeFlashcards.filter(card => card.family.id === "byakuren hachi jin")).toHaveLength(8);
    expect(kamaeFlashcards.filter(card => card.family.id === "giwa kyū jin")).toHaveLength(9);
    expect(kamaeFlashcards.filter(card => card.kyu).map(card => card.node.id).sort()).toEqual([
        "byakuren chūdan gamae", "chūdan gamae", "gedan gamae", "gyaku gedan gamae", "hassō gamae", "ichiji gamae",
    ].sort());
    for (const language of [en, ja, tr]) {
        const keys = new Set(Object.keys(language).map(key => key.toLowerCase()));
        for (const key of ["Flashkort kamae", "Öva olika kamae.", "Tillhör gruppen", "Kyū-urval · {0} kort", "Alla kamae · {0} kort",
            ...kamaeFlashcards.map(card => card.node.description!)]) expect(keys.has(key.toLowerCase()), key).toBe(true);
    }
});

it("starts automatically for the attained grade and follows a change from kyū to dan", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<KamaeFlashcard currentGrade="minarai" />);
    expect(screen.getByRole("button", { name: "Visar Kyū-urval · 6 kort" })).toBeTruthy();
    rerender(<KamaeFlashcard currentGrade="1 kyū" />);
    expect(screen.getByRole("button", { name: "Visar Kyū-urval · 6 kort" })).toBeTruthy();
    rerender(<KamaeFlashcard currentGrade="shodan" />);
    expect(screen.getByRole("button", { name: "Visar Alla kamae · 17 kort" })).toBeTruthy();
    screen.getByRole("group").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 2, name: "hälsningsposition" })).toBeTruthy();
});

it("remembers a manual all-card selection in this account's session", async () => {
    const user = userEvent.setup();
    const first = render(<BrowserStateScope.Provider value="member-a"><KamaeFlashcard currentGrade="6 kyū" /></BrowserStateScope.Provider>);
    await user.click(screen.getByRole("button", { name: "Visar Kyū-urval · 6 kort" }));
    await user.click(screen.getByRole("button", { name: "Alla kamae · 17 kort" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    first.unmount();
    const next = render(<BrowserStateScope.Provider value="member-a"><KamaeFlashcard currentGrade="6 kyū" /></BrowserStateScope.Provider>);
    expect(screen.getByRole("button", { name: "Visar Alla kamae · 17 kort" })).toBeTruthy();
    next.rerender(<BrowserStateScope.Provider value="member-b"><KamaeFlashcard currentGrade="6 kyū" /></BrowserStateScope.Provider>);
    expect(screen.getByRole("button", { name: "Visar Kyū-urval · 6 kort" })).toBeTruthy();
});

it("shows every source explanation, family and alias and learns each stable kamae identity", async () => {
    const user = userEvent.setup();
    render(<KamaeFlashcard currentGrade="nidan" />);
    const deck = screen.getByRole("group");
    deck.focus();
    for (const { node, family } of kamaeFlashcards) {
        expect(screen.getByRole("heading", { level: 2, name: node.kanji })).toBeTruthy();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("heading", { level: 2, name: node.description })).toBeTruthy();
        expect(screen.getByText(family.kanji)).toBeTruthy();
        if (node.alsoKnownAs) expect(screen.getByText(new RegExp(node.alsoKnownAs.name))).toBeTruthy();
        await user.keyboard("{ArrowRight}");
    }
    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    expect(Object.keys(getAppDataStore().get("knownFlashCards")).sort())
        .toEqual(kamaeFlashcards.map(card => `kamae:${card.node.id}`).sort());
});

it("keeps learning marks across selections and resets only cards in the displayed selection", async () => {
    const user = userEvent.setup();
    const store = getAppDataStore();
    const known = { known: true, updatedAt: "2026-11-26T12:00:00.000Z" };
    store.set("knownFlashCards", {
        ...Object.fromEntries(kamaeFlashcards.filter(card => card.kyu && card.node.id !== "hassō gamae")
            .map(card => [`kamae:${card.node.id}`, known])),
        "1": known, "hokei:test": known, "kamae:gasshō gamae": known,
    });
    render(<KamaeFlashcard currentGrade="3 kyū" />);
    screen.getByRole("group").focus();
    await user.keyboard("{ArrowRight}");
    expect(store.get("knownFlashCards")["kamae:hassō gamae"].known).toBe(true);
    await user.click(screen.getByRole("button", { name: "Visar Kyū-urval · 6 kort" }));
    await user.click(screen.getByRole("button", { name: "Alla kamae · 17 kort" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { level: 2, name: "卍構え" })).toBeTruthy();
    expect(store.get("knownFlashCards")["kamae:hassō gamae"].known).toBe(true);
    await user.click(screen.getByRole("button", { name: "Visar Alla kamae · 17 kort" }));
    await user.click(screen.getByRole("button", { name: "Kyū-urval · 6 kort" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Börja om" }));
    const progress = store.get("knownFlashCards");
    expect(progress["kamae:hassō gamae"].known).toBe(false);
    expect(progress["kamae:gasshō gamae"]).toEqual(known);
    expect(progress["1"]).toEqual(known);
    expect(progress["hokei:test"]).toEqual(known);
});
