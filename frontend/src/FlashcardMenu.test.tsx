import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it } from "vitest";
import FlashcardMenu from "./FlashcardMenu";

const Location = () => <span data-testid="location">{useLocation().pathname}</span>;

it("offers separate word and hokei flashcards", async () => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <FlashcardMenu />
            <Location />
        </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Ordlista/i })).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Hokei/i }));
    expect(screen.getByTestId("location").textContent).toBe("/flashcard/hokei");
});
