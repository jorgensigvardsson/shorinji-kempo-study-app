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
      <button type="button" onClick={() => navigate("/first", { state: { resumeActivity: true } })}>Resume first page</button>
      <button type="button" onClick={() => navigate(`${location.pathname}?q=gyaku`, { replace: true })}>Change filter</button>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteScrollManager", () => {
  it("restores the last position when resuming from the start page", async () => {
    let scrollY = 0;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/first"]}><RouteScrollManager /><NavigationHarness /></MemoryRouter>);
    scrollY = 640;
    window.dispatchEvent(new Event("scroll"));
    await user.click(screen.getByRole("button", { name: "Open second page" }));
    scrollY = 0;
    await user.click(screen.getByRole("button", { name: "Resume first page" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: "instant" });
  });

  it("does not jump to the top while editing search parameters", async () => {
    let scrollY = 0;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/search"]}><RouteScrollManager /><NavigationHarness /></MemoryRouter>);
    scrollY = 120;
    await user.click(screen.getByRole("button", { name: "Change filter" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: "instant" });
  });

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
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });

    scrollY = 540;
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location").textContent).toBe("/first");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 320, behavior: "instant" });
  });
});
