import { render, screen } from "@testing-library/react";
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
    await user.click(screen.getByText("Tryck för att vända"));
    expect(container.querySelector(".flashcard-scene")?.classList.contains("is-flipped")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Kan det" }));

    expect(getAppDataStore().get("knownFlashCards")[wordId].known).toBe(true);
});
