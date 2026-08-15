import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useTrainingMode } from "./training-mode";

// A harness rather than renderHook, because two of the three things being tested are
// navigations, and the hook reads its location from the router.
const Harness = () => {
  const [trainingMode, setTrainingMode] = useTrainingMode();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="mode">{trainingMode ? "on" : "off"}</span>
      <button onClick={() => setTrainingMode(true)}>slå på</button>
      <button onClick={() => navigate("/kamoku/free")}>till fri träning</button>
      <button onClick={() => navigate("/training/grading")}>till gradering</button>
      <button onClick={() => navigate("/settings")}>till inställningar</button>
    </>
  );
};

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><Harness /></MemoryRouter>);

const mode = () => screen.getByTestId("mode").textContent;

// The reset is deferred by a timer so the page being navigated to renders once with
// the mode it was entered under. Nothing observes that intermediate frame here, so
// the timers just have to be allowed to run.
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
};

describe("useTrainingMode", () => {
  it("starts off — it is session state, never restored", async () => {
    renderAt("/kamoku");
    await settle();
    expect(mode()).toBe("off");
  });

  it("stays on while the user moves around inside the training area", async () => {
    const user = userEvent.setup();
    renderAt("/kamoku");
    await user.click(screen.getByText("slå på"));
    expect(mode()).toBe("on");

    await user.click(screen.getByText("till fri träning"));
    await settle();

    expect(mode()).toBe("on");
  });

  // The grading tool is opened from Träning but sits outside its path, so it has to be
  // named explicitly — without that, opening it would drop the user out of Dojo mode.
  it("stays on for the grading tool, which lives outside the training path", async () => {
    const user = userEvent.setup();
    renderAt("/kamoku");
    await user.click(screen.getByText("slå på"));

    await user.click(screen.getByText("till gradering"));
    await settle();

    expect(mode()).toBe("on");
  });

  it("turns off on leaving the training area", async () => {
    const user = userEvent.setup();
    renderAt("/kamoku");
    await user.click(screen.getByText("slå på"));

    await user.click(screen.getByText("till inställningar"));
    await settle();

    expect(mode()).toBe("off");
  });

  // Hiding the app releases the real wake lock, so the app must not go on claiming a
  // mode it no longer has. The user switches it back on when they return.
  it("turns off when the app is hidden", async () => {
    const user = userEvent.setup();
    renderAt("/kamoku");
    await user.click(screen.getByText("slå på"));

    setVisibility("hidden");

    expect(mode()).toBe("off");
    setVisibility("visible");
    expect(mode()).toBe("off");
  });

  it("can be switched on again after being reset", async () => {
    const user = userEvent.setup();
    renderAt("/kamoku");
    await user.click(screen.getByText("slå på"));
    setVisibility("hidden");
    setVisibility("visible");

    await user.click(screen.getByText("slå på"));

    expect(mode()).toBe("on");
  });

  // The hook resets on leaving, not on being somewhere it does not belong: switching
  // it on outside the training area sticks until the next navigation. Nothing stops
  // that here because nothing needs to — App only renders the control where
  // getTrainingControlContext says it is relevant, so there is no button to press.
  // Written down because the division is easy to mistake for a gap.
  it("is not itself the guard against being switched on elsewhere", async () => {
    const user = userEvent.setup();
    renderAt("/settings");
    await settle();

    await user.click(screen.getByText("slå på"));
    await settle();

    expect(mode()).toBe("on");

    // It does clear on the next navigation out, as ever.
    await user.click(screen.getByText("till inställningar"));
    await user.click(screen.getByText("till fri träning"));
    await settle();
    await user.click(screen.getByText("till inställningar"));
    await settle();
    expect(mode()).toBe("off");
  });
});
