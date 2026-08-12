import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Training from "./Training";

vi.mock("./Kamoku", () => ({
  default: ({ dojoMode, onDojoModeChange }: { dojoMode?: boolean; onDojoModeChange: (enabled: boolean) => void }) => (
    <div data-testid="weekly-plan" data-dojo-mode={String(dojoMode)}>
      <input type="checkbox" aria-label="Dojo-läge" checked={dojoMode} onChange={event => onDojoModeChange(event.target.checked)} />
    </div>
  ),
}));

vi.mock("./List", () => ({
  default: ({ dojoMode }: { dojoMode?: boolean }) => (
    <div data-testid="all-hokei" data-dojo-mode={String(dojoMode)} />
  ),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const renderTraining = (initialEntry = "/kamoku") => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Training myGrade="6 kyū" allGradePlans={[]} notesData={null!} ranksData={null!} />
    <LocationProbe />
  </MemoryRouter>,
);

describe("Training", () => {
  it("opens with only weekly and free-practice choices", () => {
    renderTraining();

    expect(screen.getByRole("heading", { name: "Träning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Veckans träning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Fri träning/i })).toBeTruthy();
    expect(screen.queryByText("Alla tekniker")).toBeNull();
    expect(screen.queryByTestId("weekly-plan")).toBeNull();
  });

  it("returns from Training to the training-and-theory start page", async () => {
    const user = userEvent.setup();
    renderTraining();

    await user.click(screen.getByRole("button", { name: "Träning eller teori" }));
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("opens the weekly plan and returns to the two training choices", async () => {
    const user = userEvent.setup();
    renderTraining("/kamoku?source=start");

    await user.click(screen.getByRole("button", { name: /Veckans träning/i }));
    expect(screen.getByTestId("weekly-plan")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?source=start&view=plan");

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
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?source=start&view=free&area=randori");
    expect(screen.getByRole("button", { name: "Alla träningsområden" })).toBeTruthy();
  });

  it("redirects the legacy all-hokei view into free practice", async () => {
    renderTraining("/kamoku?view=all");

    expect(await screen.findByTestId("all-hokei")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/kamoku?view=free&area=hokei");
    expect(screen.queryByText("Alla tekniker")).toBeNull();
  });

  it("keeps dojo mode enabled while moving from weekly to free practice", async () => {
    const user = userEvent.setup();
    renderTraining();

    await user.click(screen.getByRole("button", { name: /Veckans träning/i }));
    await user.click(screen.getByRole("checkbox", { name: "Dojo-läge" }));
    expect(screen.getByTestId("weekly-plan").getAttribute("data-dojo-mode")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Träningsval" }));
    await user.click(screen.getByRole("button", { name: /Fri träning/i }));
    await user.click(screen.getByRole("button", { name: /^Hokei/i }));
    expect(screen.getByTestId("all-hokei").getAttribute("data-dojo-mode")).toBe("true");
  });
});
