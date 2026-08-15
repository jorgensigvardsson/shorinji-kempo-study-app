import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Theory from "./Theory";
import { TheoryToolPage } from "./components/ToolPage";

const LocationProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.pathname}</output>
    <button type="button" onClick={() => navigate(-1)}>Browser back</button>
  </>;
};

describe("Theory", () => {
  it("groups Technique groups, Word list, Quiz, and Flashcards under Theory", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/", "/theory"]} initialIndex={1}>
        <Theory showLanguageTools />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Teori" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Teknikgrupper/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gradering/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ordlista/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quiz/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Flashkort/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Quiz/i }));
    expect(screen.getByTestId("location").textContent).toBe("/quiz");

    await user.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/theory");

    await user.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("returns from a theory tool to the Theory page", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/theory", "/quiz"]} initialIndex={1}>
        <TheoryToolPage><div>Quiz content</div></TheoryToolPage>
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Teori" }));
    expect(screen.getByTestId("location").textContent).toBe("/theory");
  });

  it("returns from Theory through the existing app history", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/", "/theory"]} initialIndex={1}>
        <Theory showLanguageTools />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Träning eller teori" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("keeps language-dependent tools hidden when Japanese is the main language", () => {
    render(
      <MemoryRouter>
        <Theory showLanguageTools={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Quiz/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Teknikgrupper/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gradering/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ordlista/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Flashkort/i })).toBeNull();
  });
});
