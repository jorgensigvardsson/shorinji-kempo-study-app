import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Flashcard from "./Flashcard";
import { getAppDataStore } from "./persistence/store";

beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("knownFlashCards", {});
    vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
    vi.restoreAllMocks();
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
    await user.click(screen.getByRole("heading", { level: 1 }));
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

    await user.click(screen.getByRole("heading", { level: 1 }));
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
