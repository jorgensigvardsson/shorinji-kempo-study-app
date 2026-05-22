import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StarRating from "./StarRating";
import type { HokeiRankValue } from "../persistence/schema";

const getLabel = (v: HokeiRankValue) => ({ 1: "Beginner", 2: "Intermediate", 3: "Advanced" }[v]);

describe("StarRating", () => {
  it("renders 3 star buttons", () => {
    render(<StarRating value={null} onChange={() => {}} groupLabel="Rating" getLabel={getLabel} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("labels each button via getLabel", () => {
    render(<StarRating value={null} onChange={() => {}} groupLabel="Rating" getLabel={getLabel} />);
    expect(screen.getByRole("button", { name: "Beginner" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Intermediate" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeDefined();
  });

  it("has groupLabel as the accessible group label", () => {
    render(<StarRating value={null} onChange={() => {}} groupLabel="My Rating" getLabel={getLabel} />);
    expect(screen.getByRole("group", { name: "My Rating" })).toBeDefined();
  });

  it("aria-pressed is true only for the current value", () => {
    render(<StarRating value={2} onChange={() => {}} groupLabel="Rating" getLabel={getLabel} />);
    expect(screen.getByRole("button", { name: "Beginner" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Intermediate" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Advanced" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("all aria-pressed are false when value is null", () => {
    render(<StarRating value={null} onChange={() => {}} groupLabel="Rating" getLabel={getLabel} />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("calls onChange with the star value when clicked", () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} groupLabel="Rating" getLabel={getLabel} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("calls onChange with null when the current star is clicked again (toggle off)", () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} groupLabel="Rating" getLabel={getLabel} />);
    fireEvent.click(screen.getByRole("button", { name: "Intermediate" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with the new value when a different star is clicked", () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} groupLabel="Rating" getLabel={getLabel} />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("shows stars 1..value as filled and the rest as empty", () => {
    const { container } = render(
      <StarRating value={2} onChange={() => {}} groupLabel="Rating" getLabel={getLabel} />
    );
    const filled = container.querySelectorAll(".star-icon.is-filled");
    const empty = container.querySelectorAll(".star-icon.is-empty");
    expect(filled).toHaveLength(2);
    expect(empty).toHaveLength(1);
  });
});
