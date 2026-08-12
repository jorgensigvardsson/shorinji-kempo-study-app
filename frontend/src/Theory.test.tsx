import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Theory, { TheoryToolPage } from "./Theory";

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
};

describe("Theory", () => {
  it("groups Word list, Quiz, and Flashcards under Theory", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/theory"]}>
        <Theory showLanguageTools />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Teori" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ordlista/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quiz/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Flashkort/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Quiz/i }));
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("returns from a theory tool to the Theory page", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/quiz"]}>
        <TheoryToolPage><div>Quiz content</div></TheoryToolPage>
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Teori" }));
    expect(screen.getByTestId("location").textContent).toBe("/theory");
  });

  it("keeps language-dependent tools hidden when Japanese is the main language", () => {
    render(
      <MemoryRouter>
        <Theory showLanguageTools={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Quiz/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ordlista/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Flashkort/i })).toBeNull();
  });
});
