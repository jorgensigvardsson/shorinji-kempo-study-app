import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Training from "./Training";
import { TrainingToolPage } from "./components/ToolPage";

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
  it("opens with planned and self-chosen training on one page", () => {
    renderTraining();

    expect(screen.getByRole("heading", { name: "Träning" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Följ din plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Välj vad du vill träna" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Gradering\b/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Kihon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Hokei/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tan'en och sōtai/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Randori/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Embu/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Fri träning/i })).toBeNull();
    expect(screen.queryByTestId("weekly-plan")).toBeNull();
  });

  it("uses the combined overview at the old free-practice URL", () => {
    renderTraining("/kamoku/free");

    expect(screen.getByRole("heading", { name: "Träning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Randori/i })).toBeTruthy();
  });

  it("returns from Training to the training-and-theory start page", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku", true);

    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("opens the weekly plan and returns to all training choices", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: /Veckans träning/i }));
    expect(screen.getByTestId("weekly-plan")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/plan?source=start");

    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?source=start");
  });

  it("opens a chosen practice area directly and keeps it in the URL", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: /Randori/i }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/free/randori?source=start");
    expect(screen.getByRole("button", { name: "Tillbaka" })).toBeTruthy();
  });

  it("adds each training level to browser history", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start", true);

    await user.click(screen.getByRole("button", { name: /Randori/i }));
    expect(screen.getByTestId("location").textContent).toBe("/kamoku/free/randori?source=start");

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

    await user.click(screen.getByRole("button", { name: "Tillbaka" }));
    await user.click(screen.getByRole("button", { name: /^Hokei/i }));
    expect(screen.getByTestId("all-hokei").getAttribute("data-dojo-mode")).toBe("true");
  });
});

describe("TrainingToolPage", () => {
  it("keeps the training back button while a grading category is expanded", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/kamoku",
          "/training/grading?gradingCategory=3+ky%C5%AB%7C0%7C0",
        ]}
        initialIndex={1}
      >
        <TrainingToolPage><div>Category content</div></TrainingToolPage>
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("button", { name: "Tillbaka" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Träning" }).getAttribute("href")).toBe("/kamoku");

    await user.click(screen.getByRole("button", { name: "Tillbaka" }));

    expect(screen.getByTestId("location").textContent).toBe("/kamoku");
    expect(screen.getAllByRole("button", { name: "Tillbaka" })).toHaveLength(1);
  });
});
