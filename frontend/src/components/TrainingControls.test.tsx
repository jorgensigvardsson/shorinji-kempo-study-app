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
});
