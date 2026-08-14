import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Training from "./Training";

vi.mock("./Kamoku", () => ({
  default: ({ dojoMode }: { dojoMode?: boolean }) => (
    <div data-testid="weekly-plan" data-dojo-mode={String(dojoMode)} />
  ),
}));

vi.mock("./List", () => ({
  default: ({ dojoMode }: { dojoMode?: boolean }) => (
    <div data-testid="all-hokei" data-dojo-mode={String(dojoMode)} />
  ),
}));

const LocationProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button type="button" onClick={() => navigate(-1)}>Browser back</button>
  </>;
};

const renderTraining = (initialEntry = "/kamoku", includeStartEntry = false, dojoMode = false) => render(
  <MemoryRouter
    initialEntries={includeStartEntry ? ["/", initialEntry] : [initialEntry]}
    initialIndex={includeStartEntry ? 1 : 0}
  >
    <Training myGrade="6 kyū" allGradePlans={[]} dojoMode={dojoMode} />
    <LocationProbe />
  </MemoryRouter>,
);

// The section registers one splat pattern but the menu links to the bare root,
// so both have to resolve to the same component.
describe("Training route registration", () => {
  const renderAt = (initialEntry: string) => render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/kamoku/*" element={<Training myGrade="6 kyū" allGradePlans={[]} />} />
      </Routes>
    </MemoryRouter>,
  );

  it("serves the landing view at the bare section root", () => {
    renderAt("/kamoku");
    expect(screen.getByRole("heading", { name: "Träning" })).toBeTruthy();
  });

  it("serves the weekly plan at its own path", () => {
    renderAt("/kamoku/plan");
    expect(screen.getByTestId("weekly-plan")).toBeTruthy();
  });

  it("serves a free-practice area directly by URL", () => {
    renderAt("/kamoku/free/hokei");
    expect(screen.getByTestId("all-hokei")).toBeTruthy();
  });
});

describe("Training", () => {
  it("opens with weekly, free-practice, and grading choices", () => {
    renderTraining();

    expect(screen.getByRole("heading", { name: "Träning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fri träning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Gradering/i })).toBeTruthy();
    expect(screen.queryByText("Alla tekniker")).toBeNull();
    expect(screen.queryByTestId("weekly-plan")).toBeNull();
  });

  it("returns from Training to the training-and-theory start page", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku", true);

    await user.click(screen.getByRole("button", { name: "Träning eller teori" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("opens the weekly plan and returns to the two training choices", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: /Veckans träning/i }));
    expect(screen.getByTestId("weekly-plan")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/plan?source=start");

    await user.click(screen.getByRole("button", { name: "Träningsval" }));
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?source=start");
  });

  it("opens free practice and keeps the selected area in the URL", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: /Fri träning/i }));
    expect(screen.getByRole("heading", { name: "Fri träning" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Randori/i }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/free/randori?source=start");
    expect(screen.getByRole("button", { name: "Alla träningsområden" })).toBeTruthy();
  });

  it("adds each training level to browser history", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start", true);

    await user.click(screen.getByRole("button", { name: /Fri träning/i }));
    await user.click(screen.getByRole("button", { name: /Randori/i }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/free/randori?source=start");

    await user.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/free?source=start");

    await user.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("keeps the global training mode while moving from weekly to free practice", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku", false, true);

    await user.click(screen.getByRole("button", { name: /Veckans träning/i }));
    expect(screen.getByTestId("weekly-plan").getAttribute("data-dojo-mode")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Träningsval" }));
    await user.click(screen.getByRole("button", { name: /Fri träning/i }));
    await user.click(screen.getByRole("button", { name: /^Hokei/i }));
    expect(screen.getByTestId("all-hokei").getAttribute("data-dojo-mode")).toBe("true");
  });
});
