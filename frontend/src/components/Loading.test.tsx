import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import Loading from "./Loading";
import { useLoadingPhase } from "../hooks";

// Every one of these is about when something appears, so they all drive the clock.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const coldStartNote = "Servern startar. Det kan ta en stund.";

describe("Loading", () => {
  // A warm service answers inside this window, and an indicator that appears and
  // disappears that fast reads as a flicker rather than as an assurance.
  it("draws nothing while the wait is still too short to mention", () => {
    render(<Loading />);
    act(() => { vi.advanceTimersByTime(150); });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says what is happening once the wait is worth mentioning", () => {
    render(<Loading />);
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByRole("status").textContent).toContain("Laddar…");
    // Nothing has taken long enough yet to be worth explaining.
    expect(screen.queryByText(coldStartNote)).toBeNull();
  });

  it("says what is being waited for when the caller has something to say", () => {
    render(<Loading label="Hämtar ansökningar…" />);
    act(() => { vi.advanceTimersByTime(200); });

    expect(screen.getByRole("status").textContent).toContain("Hämtar ansökningar…");
    expect(screen.queryByText("Laddar…")).toBeNull();
  });

  // The point of the whole component: a service that has scaled to zero is slow
  // once, for whoever asks first, and that is worth explaining rather than leaving
  // to look like an app that is simply slow.
  it("explains the wait once it is longer than a running service could be", () => {
    render(<Loading />);
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText(coldStartNote)).toBeDefined();
  });

  // A page chunk on its way is the app fetching its own code. It can be just as
  // slow, but blaming a service for it would simply be untrue.
  it("blames no service for a wait that is not one", () => {
    render(<Loading fromService={false} />);
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByRole("status").textContent).toContain("Laddar…");
    expect(screen.queryByText(coldStartNote)).toBeNull();
  });

  // The spinner beside the text carries no information a screen reader needs; left
  // in the accessible tree it is a second, empty status next to the real one.
  it("leaves the spinner out of what is read aloud", () => {
    const { container } = render(<Loading />);
    act(() => { vi.advanceTimersByTime(200); });

    expect(container.querySelector(".spinner-border")?.getAttribute("aria-hidden")).toBe("true");
  });
});

const Harness = ({ initiallyActive }: { initiallyActive: boolean }) => {
  const [active, setActive] = useState(initiallyActive);
  const phase = useLoadingPhase(active);
  return (
    <>
      <span data-testid="phase">{phase}</span>
      <button onClick={() => setActive(a => !a)}>växla</button>
    </>
  );
};

const phase = () => screen.getByTestId("phase").textContent;

describe("useLoadingPhase", () => {
  it("stays settled while nothing is being waited for", () => {
    render(<Harness initiallyActive={false} />);
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(phase()).toBe("settling");
  });

  it("passes through waiting on its way to cold", () => {
    render(<Harness initiallyActive={true} />);
    expect(phase()).toBe("settling");

    act(() => { vi.advanceTimersByTime(200); });
    expect(phase()).toBe("waiting");

    act(() => { vi.advanceTimersByTime(2800); });
    expect(phase()).toBe("cold");
  });

  it("settles again the moment the wait is over", () => {
    render(<Harness initiallyActive={true} />);
    act(() => { vi.advanceTimersByTime(3000); });

    act(() => { screen.getByText("växla").click(); });

    expect(phase()).toBe("settling");
  });

  // A second wait is its own wait. Starting it at the phase the previous one
  // reached would report a cold start for a request that has just gone out.
  it("starts the next wait from the beginning", () => {
    render(<Harness initiallyActive={true} />);
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { screen.getByText("växla").click(); });

    act(() => { screen.getByText("växla").click(); });

    expect(phase()).toBe("settling");
    act(() => { vi.advanceTimersByTime(200); });
    expect(phase()).toBe("waiting");
  });
});
