import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense, lazy, useState } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beginNavigation, endNavigation, getPendingNavigation } from "./navigation-pending";
import { useNavigationPending } from "./hooks";

// The indicator waits before appearing, so every test here controls the clock.
beforeEach(() => {
  vi.useFakeTimers();
  endNavigation();
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("beginNavigation", () => {
  it("records where the app is going", () => {
    beginNavigation("/kamoku");
    expect(getPendingNavigation()).toBe("/kamoku");
  });

  // Navigating to the current page commits nothing, so there would be no location
  // change to end it — the indicator would stay up for the rest of the session.
  it("ignores a navigation to where the app already is", () => {
    window.history.pushState({}, "", "/kamoku");
    beginNavigation("/kamoku");
    expect(getPendingNavigation()).toBeNull();
  });
});

const Slow = lazy(() => new Promise<{ default: () => React.ReactElement }>(() => {
  // Never resolves: this is the page that has not arrived.
}));

// Arrives quickly, but not synchronously — a chunk already in the browser's cache.
// This is the case the delay exists for, so the test drives its arrival by hand.
let arriveBrisk: () => void = () => {};
const Brisk = lazy(() => new Promise<{ default: () => React.ReactElement }>(resolve => {
  arriveBrisk = () => resolve({ default: () => <div>rask sida</div> });
}));

const Harness = () => {
  const pending = useNavigationPending();
  const navigate = useNavigate();
  const [, force] = useState(0);
  return (
    <>
      <span data-testid="indicator">{pending ? "visible" : "hidden"}</span>
      <button onClick={() => { beginNavigation("/slow"); navigate("/slow"); }}>till långsam</button>
      <button onClick={() => { beginNavigation("/fast"); navigate("/fast"); }}>till snabb</button>
      <button onClick={() => { beginNavigation("/rask"); navigate("/rask"); }}>till rask</button>
      <button onClick={() => force(n => n + 1)}>rendera om</button>
      <Suspense fallback={<div>reserv</div>}>
        <Routes>
          <Route path="/" element={<div>start</div>} />
          <Route path="/fast" element={<div>snabb sida</div>} />
          <Route path="/slow" element={<Slow />} />
          <Route path="/rask" element={<Brisk />} />
        </Routes>
      </Suspense>
    </>
  );
};

const indicator = () => screen.getByTestId("indicator").textContent;

describe("useNavigationPending", () => {
  it("shows nothing while nothing is happening", () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);
    expect(indicator()).toBe("hidden");
  });

  it("shows nothing for a navigation that commits immediately", () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);

    act(() => { screen.getByText("till snabb").click(); });
    act(() => { vi.advanceTimersByTime(50); });

    expect(indicator()).toBe("hidden");
    expect(screen.getByText("snabb sida")).toBeDefined();
  });

  // The whole point of the delay. A chunk already in the browser's cache arrives in
  // well under the threshold, and a bar that appears and vanishes that fast reads as
  // a glitch rather than as progress.
  it("stays hidden for a page that arrives before the delay is up", async () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);

    act(() => { screen.getByText("till rask").click(); });
    act(() => { vi.advanceTimersByTime(150) });
    expect(indicator()).toBe("hidden");

    await act(async () => { arriveBrisk(); await vi.advanceTimersByTimeAsync(0); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.getByText("rask sida")).toBeDefined();
    expect(indicator()).toBe("hidden");
  });

  it("appears once a navigation has been waiting long enough to notice", () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);

    act(() => { screen.getByText("till långsam").click(); });
    expect(indicator()).toBe("hidden");

    act(() => { vi.advanceTimersByTime(200); });

    expect(indicator()).toBe("visible");
    // React holds the whole commit back, so the previous page is still what is shown.
    expect(screen.getByText("start")).toBeDefined();
  });

  it("clears once the page it was waiting for arrives", () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);
    act(() => { screen.getByText("till snabb").click(); });
    act(() => { vi.advanceTimersByTime(200); });

    expect(indicator()).toBe("hidden");
    expect(getPendingNavigation()).toBeNull();
  });

  it("keeps waiting across an unrelated re-render", () => {
    render(<MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter>);
    act(() => { screen.getByText("till långsam").click(); });
    act(() => { vi.advanceTimersByTime(200); });

    act(() => { screen.getByText("rendera om").click(); });

    expect(indicator()).toBe("visible");
  });
});
