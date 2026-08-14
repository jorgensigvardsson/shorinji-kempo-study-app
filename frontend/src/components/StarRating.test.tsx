import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StarRating from "./StarRating";
import type { HokeiRankValue } from "../persistence/schema";

const getLabel = (value: HokeiRankValue) => ({
  1: "Needs practice",
  2: "Practising",
  3: "Confident",
}[value]);

const renderAssessment = (value: HokeiRankValue | null, onChange = () => undefined) => render(
  <StarRating
    value={value}
    onChange={onChange}
    groupLabel="Self-assessment"
    emptyLabel="Not assessed"
    getLabel={getLabel}
  />,
);

describe("self-assessment control", () => {
  it("shows the current status as three compact progress dots while closed", () => {
    const { container } = renderAssessment(2);

    expect(screen.getByRole("button", { name: "Self-assessment: Practising" })).toBeTruthy();
    expect(container.querySelectorAll(".self-assessment-progress .self-assessment-dot")).toHaveLength(3);
    expect(container.querySelectorAll(".self-assessment-progress .is-filled")).toHaveLength(2);
    expect(screen.queryByText("Practising")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("shows a calm unassessed state when no value is stored", () => {
    const { container } = renderAssessment(null);

    expect(screen.getByRole("button", { name: "Self-assessment: Not assessed" })).toBeTruthy();
    expect(container.querySelectorAll(".self-assessment-progress .is-filled")).toHaveLength(0);
  });

  it("opens the semantic choices without toggling the surrounding card", () => {
    renderAssessment(1);

    fireEvent.click(screen.getByRole("button", { name: "Self-assessment: Needs practice" }));

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Needs practice" }).getAttribute("aria-checked")).toBe("true");
  });

  it("stores the selected assessment and closes the choices", () => {
    const onChange = vi.fn();
    renderAssessment(null, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Self-assessment: Not assessed" }));

    fireEvent.click(screen.getByRole("radio", { name: "Confident" }));

    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("can clear a stored assessment", () => {
    const onChange = vi.fn();
    renderAssessment(2, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Self-assessment: Practising" }));

    fireEvent.click(screen.getByRole("radio", { name: "Not assessed" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
