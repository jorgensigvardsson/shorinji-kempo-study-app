import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectionWordLookup from "./SelectionWordLookup";
import CollapsibleCard from "./CollapsibleCard";

const selectElementText = (element: Element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  Object.defineProperty(range, "getClientRects", {
    value: () => [{ left: 20, right: 100, top: 20, bottom: 40, width: 80, height: 20 }],
  });
  Object.defineProperty(range, "getBoundingClientRect", {
    value: () => ({ left: 20, right: 100, top: 20, bottom: 40, width: 80, height: 20 }),
  });
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
});

describe("SelectionWordLookup", () => {
  it("shows a compact dictionary result without leaving the page", async () => {
    const user = userEvent.setup();
    render(
      <>
        <p data-testid="term">gyaku gote</p>
        <SelectionWordLookup />
      </>,
    );

    selectElementText(screen.getByTestId("term"));
    fireEvent.mouseUp(document);
    await user.click(await screen.findByRole("button", { name: "Sök" }));

    const dialog = await screen.findByRole("dialog", { name: "Ordlista: gyaku gote" });
    expect(dialog.textContent).toContain("gyaku");
    expect(dialog.textContent).toContain("gote");
    expect(document.body.textContent).toContain("gyaku gote");
  });

  it("does not offer lookup for selected editable text", () => {
    render(
      <>
        <div contentEditable="true" data-testid="notes">privat anteckning</div>
        <SelectionWordLookup />
      </>,
    );

    selectElementText(screen.getByTestId("notes"));
    fireEvent.mouseUp(document);
    expect(screen.queryByRole("button", { name: "Sök" })).toBeNull();
  });

  it("opens the dictionary on touch long press without expanding a collapsed card", () => {
    vi.useFakeTimers();
    const { container } = render(
      <>
        <CollapsibleCard header={<span data-testid="pressed-term">gyaku gote</span>}>Hidden body</CollapsibleCard>
        <SelectionWordLookup />
      </>,
    );
    const term = screen.getByTestId("pressed-term");
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: term.firstChild, offset: 2 }),
    });

    fireEvent.pointerDown(term, { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(525);
    });
    fireEvent.pointerUp(term, { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 40 });
    fireEvent.click(term);

    expect(screen.getByRole("dialog", { name: "Ordlista: gyaku" })).toBeDefined();
    expect(container.querySelector(".card")?.classList.contains("is-collapsed")).toBe(true);
    vi.useRealTimers();
  });
});
