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
    bodyFontPicker: undefined,
    headingFontPicker: undefined,
    kanjiFontPicker: undefined,
    ...overrides,
  };
  render(<MemoryRouter><TrainingControls {...props} /></MemoryRouter>);
  return props;
};

describe("TrainingControls", () => {
  beforeEach(() => localStorage.removeItem("training-mode-intro-seen"));

  it("requires confirmation the first time Dojo mode becomes relevant", async () => {
    const user = userEvent.setup();
    renderControls();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Förenklar träningsvyn/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "OK" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("training-mode-intro-seen")).toBe("true");
  });

  it("changes the displayed grade and Dojo mode from one compact panel", async () => {
    localStorage.setItem("training-mode-intro-seen", "true");
    const user = userEvent.setup();
    const props = renderControls();

    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Visad grad" }), "5 kyū");
    await user.click(screen.getByRole("checkbox", { name: "Dojo-läge" }));

    expect(props.onGradeChange).toHaveBeenCalledWith("5 kyū");
    expect(props.onTrainingModeChange).toHaveBeenCalledWith(true);
  });

  it("shows only the grade on theoretical grading pages", async () => {
    const user = userEvent.setup();
    renderControls({ showTrainingMode: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    expect(screen.getByRole("combobox", { name: "Visad grad" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Dojo-läge" })).toBeNull();
  });

  it("stays hidden where neither control is relevant", () => {
    renderControls({ showGrade: false, showTrainingMode: false });
    expect(screen.queryByRole("button", { name: "Träningsverktyg" })).toBeNull();
  });

  it("shows the body font picker on its own when no other control applies", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderControls({
      showGrade: false,
      showTrainingMode: false,
      bodyFontPicker: { value: "", onChange, filter: { search: "", category: "", subset: "" }, onFilterChange: vi.fn() },
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Body font" }), "Roboto");

    expect(onChange).toHaveBeenCalledWith("Roboto");
  });

  it("shows all three font pickers together, independently", async () => {
    const user = userEvent.setup();
    const onBodyChange = vi.fn();
    const onHeadingChange = vi.fn();
    const onKanjiChange = vi.fn();
    renderControls({
      showGrade: false,
      showTrainingMode: false,
      bodyFontPicker: { value: "", onChange: onBodyChange, filter: { search: "", category: "", subset: "" }, onFilterChange: vi.fn() },
      headingFontPicker: { value: "", onChange: onHeadingChange, filter: { search: "", category: "", subset: "" }, onFilterChange: vi.fn() },
      kanjiFontPicker: { value: "", onChange: onKanjiChange, filter: { search: "", category: "", subset: "japanese" }, onFilterChange: vi.fn() },
    });

    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Body font" }), "Roboto");
    await user.selectOptions(screen.getByRole("combobox", { name: "Heading font" }), "Playfair Display");
    await user.selectOptions(screen.getByRole("combobox", { name: "Kanji font" }), "Noto Sans JP");

    expect(onBodyChange).toHaveBeenCalledWith("Roboto");
    expect(onHeadingChange).toHaveBeenCalledWith("Playfair Display");
    expect(onKanjiChange).toHaveBeenCalledWith("Noto Sans JP");
  });

  it("offers the kanji picker only fonts that can actually render Japanese, when filtered to it", async () => {
    const user = userEvent.setup();
    renderControls({
      showGrade: false,
      showTrainingMode: false,
      kanjiFontPicker: { value: "", onChange: vi.fn(), filter: { search: "", category: "", subset: "japanese" }, onFilterChange: vi.fn() },
    });

    await user.click(screen.getByRole("button", { name: "Träningsverktyg" }));
    const options = screen.getByRole("combobox", { name: "Kanji font" }).querySelectorAll("option");
    const families = [...options].map(option => option.textContent);

    expect(families).toContain("Noto Sans JP");
    expect(families).not.toContain("Roboto");
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
      bodyFontPicker: {
        value: "",
        onChange: vi.fn(),
        filter: { search: "robo", category: "", subset: "" },
        onFilterChange: vi.fn(),
      },
    });

    const trigger = screen.getByRole("button", { name: "Träningsverktyg" });
    await user.click(trigger); // open
    expect((screen.getByPlaceholderText("Search Body fonts…") as HTMLInputElement).value).toBe("robo");

    await user.click(trigger); // collapse — unmounts the panel
    expect(screen.queryByPlaceholderText("Search Body fonts…")).toBeNull();

    await user.click(trigger); // reopen — remounts it
    expect((screen.getByPlaceholderText("Search Body fonts…") as HTMLInputElement).value).toBe("robo");
  });
});
