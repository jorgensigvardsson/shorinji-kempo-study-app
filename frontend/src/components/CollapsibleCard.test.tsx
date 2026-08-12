import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CollapsibleCard from "./CollapsibleCard";

describe("CollapsibleCard", () => {
  it("renders the header content", () => {
    render(<CollapsibleCard header="My Header">body</CollapsibleCard>);
    expect(screen.getByText("My Header")).toBeDefined();
  });

  it("renders children", () => {
    render(<CollapsibleCard header="H">Child content</CollapsibleCard>);
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("has is-collapsed class initially", () => {
    const { container } = render(<CollapsibleCard header="H">body</CollapsibleCard>);
    expect(container.querySelector(".card")?.classList.contains("is-collapsed")).toBe(true);
  });

  it("switches to is-expanded class after clicking the header", () => {
    const { container } = render(<CollapsibleCard header="H">body</CollapsibleCard>);
    fireEvent.click(screen.getByText("H"));
    expect(container.querySelector(".card")?.classList.contains("is-expanded")).toBe(true);
  });

  it("collapses again when header is clicked a second time", () => {
    const { container } = render(<CollapsibleCard header="H">body</CollapsibleCard>);
    const header = screen.getByText("H");
    fireEvent.click(header);
    fireEvent.click(header);
    expect(container.querySelector(".card")?.classList.contains("is-collapsed")).toBe(true);
  });

  it("does not expand when a user has selected text in the header", () => {
    const { container } = render(<CollapsibleCard header="Selectable header">body</CollapsibleCard>);
    const text = screen.getByText("Selectable header");
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    fireEvent.click(text);

    expect(container.querySelector(".card")?.classList.contains("is-collapsed")).toBe(true);
    selection.removeAllRanges();
  });

  it("shows a chevron by default", () => {
    const { container } = render(<CollapsibleCard header="H">body</CollapsibleCard>);
    expect(container.querySelector(".collapsible-card-chevron")).not.toBeNull();
  });

  it("hides the chevron when showCollapse is false", () => {
    const { container } = render(
      <CollapsibleCard header="H" showCollapse={false}>body</CollapsibleCard>
    );
    expect(container.querySelector(".collapsible-card-chevron")).toBeNull();
  });

  it("renders footer content when provided", () => {
    render(
      <CollapsibleCard header="H" footer={<span>Footer text</span>}>body</CollapsibleCard>
    );
    expect(screen.getByText("Footer text")).toBeDefined();
  });

  it("applies the custom className to the card", () => {
    const { container } = render(
      <CollapsibleCard header="H" className="my-custom-class">body</CollapsibleCard>
    );
    expect(container.querySelector(".my-custom-class")).not.toBeNull();
  });

  it("spotlights and focuses the card until it is closed", async () => {
    const { container } = render(
      <CollapsibleCard header="Focused technique" focusOnOpen>body</CollapsibleCard>
    );

    fireEvent.click(screen.getByText("Focused technique"));
    const header = container.querySelector<HTMLElement>(".card-header");

    expect(document.body.classList.contains("card-focus-active")).toBe(true);
    expect(container.querySelector(".focus-card.is-expanded")).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(header));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.classList.contains("card-focus-active")).toBe(false);
    expect(container.querySelector(".focus-card.is-collapsed")).not.toBeNull();
  });
});
