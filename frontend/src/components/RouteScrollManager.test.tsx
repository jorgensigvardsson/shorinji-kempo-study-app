import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import RouteScrollManager from "./RouteScrollManager";

const NavigationHarness = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <button type="button" onClick={() => navigate("/second")}>Open second page</button>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteScrollManager", () => {
  it("starts a new page at the top and restores the previous page on Back", async () => {
    let scrollY = 0;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/first"]}>
        <RouteScrollManager />
        <NavigationHarness />
      </MemoryRouter>,
    );

    scrollY = 320;
    await user.click(screen.getByRole("button", { name: "Open second page" }));
    expect(screen.getByTestId("location").textContent).toBe("/second");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });

    scrollY = 540;
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location").textContent).toBe("/first");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: "auto" });
  });
});
