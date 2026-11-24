import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Flashcard from "./Flashcard";
import { getAppDataStore } from "./persistence/store";
import wordList from "./assets/word-list.json";

const footworkIds = [539, 540, 541, 542, 543, 544, 545, 546, 547];

beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("knownFlashCards", {});
    vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
    vi.restoreAllMocks();
});

it("lets keyboard users turn the card and exposes only the current face", async () => {
    const user = userEvent.setup();
    render(<Flashcard />);
    const frontName = screen.getByRole("heading", { level: 2 }).textContent!;
    const deck = screen.getByRole("group", {
        name: "Svep vänster för att öva igen eller höger om du kan det.",
    });

    await user.tab();
    expect(document.activeElement).toBe(deck);
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("heading", { name: frontName })).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();

    await user.keyboard(" ");
    expect(screen.getByRole("heading", { name: frontName })).toBeTruthy();
});

it("keeps word cards flippable and stores their historical numeric id", async () => {
    const user = userEvent.setup();
    const { container } = render(<Flashcard />);
    const index = container.querySelector(".flashcard-index")?.textContent ?? "";
    const wordId = index.replace("#", "");

    expect(wordId).toMatch(/^\d+$/);
    expect(screen.queryByText("Framsida")).toBeNull();
    expect(screen.queryByText("Baksida")).toBeNull();
    expect(screen.queryByText("Tryck för att vända")).toBeNull();
    expect(screen.queryByText("Tryck för att vända tillbaka")).toBeNull();
    await user.click(screen.getByRole("heading", { level: 2 }));
    expect(container.querySelector(".flashcard-scene")?.classList.contains("is-flipped")).toBe(true);

    expect(screen.queryByRole("button", { name: "Kan det" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nästa kort" })).toBeNull();
    expect(screen.getByText("← Öva igen")).toBeDefined();
    expect(screen.getByText("Kan det →")).toBeDefined();

    const deck = screen.getByRole("group", {
        name: "Svep vänster för att öva igen eller höger om du kan det.",
    });
    fireEvent.pointerDown(deck, { pointerId: 1, clientX: 20, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 140, clientY: 102 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 140, clientY: 102 });

    await waitFor(() => {
        expect(getAppDataStore().get("knownFlashCards")[wordId].known).toBe(true);
    });
});

it("ignores vertical and interrupted gestures instead of changing cards", async () => {
    const { container } = render(<Flashcard />);
    const initialIndex = container.querySelector(".flashcard-index")?.textContent;
    const deck = screen.getByRole("group", {
        name: "Svep vänster för att öva igen eller höger om du kan det.",
    });

    fireEvent.pointerDown(deck, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 2, clientX: 102, clientY: 120 });
    fireEvent.pointerUp(deck, { pointerId: 2, clientX: 0, clientY: 120 });

    await new Promise(resolve => window.setTimeout(resolve, 450));
    expect(container.querySelector(".flashcard-index")?.textContent).toBe(initialIndex);
    expect(getAppDataStore().get("knownFlashCards")).toEqual({});
});

it("keeps swipe feedback stationary and mounts the next card on its front", async () => {
    const user = userEvent.setup();
    const { container } = render(<Flashcard />);
    const deck = screen.getByRole("group", {
        name: "Svep vänster för att öva igen eller höger om du kan det.",
    });

    await user.click(screen.getByRole("heading", { level: 2 }));
    const flippedScene = container.querySelector(".flashcard-scene");
    expect(flippedScene?.classList.contains("is-flipped")).toBe(true);

    fireEvent.pointerDown(deck, { pointerId: 3, clientX: 140, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 3, clientX: 20, clientY: 102 });
    expect(container.querySelector(".flashcard-swipe-indicator")?.parentElement)
        .toBe(container.querySelector(".flashcard-swipe-stage"));
    fireEvent.pointerUp(deck, { pointerId: 3, clientX: 20, clientY: 102 });

    await waitFor(() => {
        const nextScene = container.querySelector(".flashcard-scene");
        expect(nextScene).not.toBe(flippedScene);
        expect(nextScene?.classList.contains("is-flipped")).toBe(false);
    });
});

it("dismisses the swipe guide after navigating and keeps feedback available during a swipe", async () => {
    const user = userEvent.setup();
    const first = render(<Flashcard />);
    expect(first.container.querySelector(".flashcard-swipe-guide")).toBeTruthy();
    screen.getByRole("group").focus();
    await user.keyboard("{ArrowLeft}");
    expect(first.container.querySelector(".flashcard-swipe-guide")).toBeNull();
    expect(localStorage.getItem("flashcard-swipe-guide-dismissed")).toBe("true");
    first.unmount();

    const next = render(<Flashcard deck="footwork" />);
    expect(next.container.querySelector(".flashcard-swipe-guide")).toBeNull();
    const deck = screen.getByRole("group");
    fireEvent.pointerDown(deck, { pointerId: 4, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 4, clientX: 120, clientY: 102 });
    expect(screen.getByText("Kan det")).toBeTruthy();
    fireEvent.pointerCancel(deck, { pointerId: 4 });
    expect(screen.queryByText("Kan det")).toBeNull();
    expect(getAppDataStore().get("knownFlashCards")).toEqual({});
});

it("shows exactly the nine footwork cards with Japanese fronts and Swedish backs", async () => {
    const user = userEvent.setup();
    render(<Flashcard deck="footwork" />);
    expect(screen.getByRole("heading", { level: 1, name: "Fotförflyttningar" })).toBeTruthy();
    const deck = screen.getByRole("group");
    deck.focus();

    for (const id of footworkIds) {
        const word = wordList.find(entry => entry.id === id)!;
        expect(screen.getByRole("heading", { level: 2, name: word.kanji })).toBeTruthy();
        expect(screen.getByText(word.romaji!)).toBeTruthy();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("heading", { level: 2, name: word.meanings![0] })).toBeTruthy();
        await user.keyboard("{ArrowRight}");
    }

    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    expect(Object.keys(getAppDataStore().get("knownFlashCards")).sort())
        .toEqual(footworkIds.map(String));
});

it("shares footwork learning marks with the full word deck", async () => {
    const user = userEvent.setup();
    const store = getAppDataStore();
    store.set("knownFlashCards", Object.fromEntries(wordList
        .filter(word => word.id !== 539 && word.id !== 540)
        .map(word => [String(word.id), { known: true, updatedAt: new Date().toISOString() }])));
    const { rerender, container } = render(<Flashcard deck="footwork" />);
    screen.getByRole("group").focus();
    await user.keyboard("{ArrowRight}");
    expect(store.get("knownFlashCards")["539"].known).toBe(true);

    rerender(<Flashcard />);
    expect(container.querySelector(".flashcard-index")?.textContent).toBe("#540");
    expect(screen.getByRole("heading", { level: 2, name: "順退り" })).toBeTruthy();
});

it("restarts only the footwork cards without clearing other learned words or hokei", async () => {
    const user = userEvent.setup();
    const store = getAppDataStore();
    const known = { known: true, updatedAt: new Date().toISOString() };
    store.set("knownFlashCards", {
        ...Object.fromEntries(footworkIds.map(id => [String(id), known])),
        "1": known,
        "hokei:test": known,
    });
    render(<Flashcard deck="footwork" />);
    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Börja om" }));

    expect(footworkIds.every(id => !store.get("knownFlashCards")[String(id)].known)).toBe(true);
    expect(store.get("knownFlashCards")["1"].known).toBe(true);
    expect(store.get("knownFlashCards")["hokei:test"].known).toBe(true);
    expect(screen.getByRole("heading", { level: 2, name: "後千鳥足" })).toBeTruthy();
});
