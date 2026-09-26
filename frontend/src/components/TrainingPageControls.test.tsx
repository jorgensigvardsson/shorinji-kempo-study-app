import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradePlan } from "../data";
import { TrainingViewSettingsContext, type TrainingViewSettings } from "../training-view-settings-context";
import TrainingPageControls, { FocusChoicePicker } from "./TrainingPageControls";

const plans = [
  { grade: "6 kyū", weeks: [] },
  { grade: "shodan", weeks: [] },
] as GradePlan[];

const renderControls = (overrides: Partial<TrainingViewSettings> = {}) => {
  const settings: TrainingViewSettings = {
    grade: "shodan",
    gradePlans: plans,
    onGradeChange: vi.fn(),
    dojoMode: false,
    onDojoModeChange: vi.fn(),
    ...overrides,
  };
  render(
    <TrainingViewSettingsContext.Provider value={settings}>
      <TrainingPageControls showGrade showDojo />
    </TrainingViewSettingsContext.Provider>,
  );
  return settings;
};

describe("TrainingPageControls", () => {
  beforeEach(() => localStorage.removeItem("dojo-mode-activation-intro-seen"));

  it("shows the current grade compactly and changes only the temporary display grade", async () => {
    const user = userEvent.setup();
    const settings = renderControls();

    await user.click(screen.getByRole("button", { name: "Visar Shodan" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector(".modal-dialog")?.classList.contains("modal-fullscreen")).toBe(true);
    expect(screen.getByRole("heading", { name: "Välj grad" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "6 kyū" }));
    expect(settings.onGradeChange).toHaveBeenCalledWith("6 kyū");
  });

  it("explains Dojo mode when it is activated for the first time", async () => {
    const user = userEvent.setup();
    const settings = renderControls();

    await user.click(screen.getByRole("checkbox", { name: "Dojo-läge" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(settings.onDojoModeChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Aktivera" }));
    expect(settings.onDojoModeChange).toHaveBeenCalledWith(true);
    expect(localStorage.getItem("dojo-mode-activation-intro-seen")).toBe("true");
  });

  it("switches Dojo mode directly after the explanation has been seen", async () => {
    localStorage.setItem("dojo-mode-activation-intro-seen", "true");
    const user = userEvent.setup();
    const settings = renderControls({ dojoMode: true });

    await user.click(screen.getByRole("checkbox", { name: "Dojo-läge" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(settings.onDojoModeChange).toHaveBeenCalledWith(false);
  });

  it("supports the broader choices used on the Hokei page", async () => {
    const user = userEvent.setup();
    render(
      <FocusChoicePicker
        title="Välj vad som visas"
        value="shodan"
        onChange={vi.fn()}
        choices={[
          { value: "all", label: "Alla" },
          { value: "up-to-own", label: "Alla till och med egna" },
          { value: "shodan", label: "Shodan" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Visar Shodan" }));
    expect(screen.getByRole("button", { name: "Alla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alla till och med egna" })).toBeTruthy();
    expect(screen.queryByText("Endast egna")).toBeNull();
  });
});
