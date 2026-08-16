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

  it("adds the account display name to the greeting when one is available", () => {
    render(
      <MemoryRouter>
        <Start routes={[]} displayName="  Malin  " />
      </MemoryRouter>,
    );

    // Looking the element up by the plain label, then finding the emoji only in
    // the visible text, is what pins the hands to decoration rather than name.
    expect(screen.getByLabelText("Gasshō, Malin").textContent).toBe("Gasshō, Malin 🙏");
  });

  it("keeps the plain greeting when the account has no display name", () => {
    render(
      <MemoryRouter>
        <Start routes={[]} displayName="   " />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Gasshō").textContent).toBe("Gasshō 🙏");
  });
});
