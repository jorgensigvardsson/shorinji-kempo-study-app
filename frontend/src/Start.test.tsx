import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Start from "./Start";

describe("Start", () => {
  it("uses the context row for a quiet Gasshō greeting above the page heading", () => {
    render(
      <MemoryRouter>
        <Start routes={[]} />
      </MemoryRouter>,
    );

    const greeting = screen.getByLabelText("Gasshō");
    const heading = screen.getByRole("heading", { name: "Vad vill du göra idag?" });

    expect(greeting.classList.contains("start-context")).toBe(true);
    expect(greeting.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
