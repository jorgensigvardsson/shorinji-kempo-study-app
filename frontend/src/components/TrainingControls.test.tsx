import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradePlan } from "../data";
import TrainingControls from "./TrainingControls";

const plans = [
  { grade: "6 kyū", weeks: [] },
  { grade: "5 kyū", weeks: [] },
] as GradePlan[];

const renderControls = (overrides: Partial<React.ComponentProps<typeof TrainingControls>> = {}) => {
  const props: React.ComponentProps<typeof TrainingControls> = {
    grade: "6 kyū",
    gradePlans: plans,
    onGradeChange: vi.fn(),
    showGrade: true,
    showTrainingMode: true,
    trainingMode: false,
    onTrainingModeChange: vi.fn(),
    fontPicker: undefined,
    ...overrides,
  };
  render(<MemoryRouter><TrainingControls {...props} /></MemoryRouter>);
  return props;
};

describe("TrainingControls", () => {
  beforeEach(() => localStorage.removeItem("training-mode-intro-seen"));

  it("requires confirmation the first time Training mode becomes relevant", async () => {
    const user = userEvent.setup();
    renderControls();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Förenklar träningsvyn/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("training-mode-intro-seen")).toBe("true");
  });

  it("changes the displayed grade and Training mode from one compact panel", async () => {
    localStorage.setItem("training-mode-intro-seen", "true");
    const user = userEvent.setup();
    const props = renderControls();

    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Visad grad" }), "5 kyū");
    await user.click(screen.getByRole("checkbox", { name: "Träningsläge" }));

    expect(props.onGradeChange).toHaveBeenCalledWith("5 kyū");
    expect(props.onTrainingModeChange).toHaveBeenCalledWith(true);
  });

  it("shows only the grade on theoretical grading pages", async () => {
    const user = userEvent.setup();
    renderControls({ showTrainingMode: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    expect(screen.getByRole("combobox", { name: "Visad grad" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Träningsläge" })).toBeNull();
  });

  it("stays hidden where neither control is relevant", () => {
    renderControls({ showGrade: false, showTrainingMode: false });
    expect(screen.queryByRole("button", { name: "Träningsverktyg" })).toBeNull();
  });

  it("shows the font picker on its own when no other control applies", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderControls({
      showGrade: false,
      showTrainingMode: false,
      fontPicker: { value: "", onChange, filter: { search: "", category: "", subset: "" }, onFilterChange: vi.fn() },
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Font" }), "Roboto");

    expect(onChange).toHaveBeenCalledWith("Roboto");
  });

  // The panel unmounts its contents whenever it collapses (including the
  // auto-collapse that happens on every route change), so the filter state
  // must come from a prop the caller keeps alive elsewhere, not from
  // FontPicker's own state — otherwise it would reset on every navigation.
  it("keeps showing the caller's filter state across a collapse/reopen cycle", async () => {
    const user = userEvent.setup();
    renderControls({
      showGrade: false,
      showTrainingMode: false,
      fontPicker: {
        value: "",
        onChange: vi.fn(),
        filter: { search: "robo", category: "", subset: "" },
        onFilterChange: vi.fn(),
      },
    });

    const trigger = screen.getByRole("button", { name: "Träningsverktyg" });
    await user.click(trigger); // open
    expect((screen.getByPlaceholderText("Search fonts…") as HTMLInputElement).value).toBe("robo");

    await user.click(trigger); // collapse — unmounts the panel
    expect(screen.queryByPlaceholderText("Search fonts…")).toBeNull();

    await user.click(trigger); // reopen — remounts it
    expect((screen.getByPlaceholderText("Search fonts…") as HTMLInputElement).value).toBe("robo");
  });
});
