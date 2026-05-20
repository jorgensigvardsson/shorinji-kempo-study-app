import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

const Boom = ({ error }: { error: Error | null }) => {
  if (error) throw error;
  return <span>child rendered</span>;
};

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Boom error={null} />
      </ErrorBoundary>
    );
    expect(screen.getByText("child rendered")).toBeDefined();
  });

  it("renders the fallback UI when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("boom")} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Något gick fel")).toBeDefined();
  });

  it("shows the thrown error message in the fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("very specific error text")} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/very specific error text/)).toBeDefined();
  });

  it("does not render children after an error is caught", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("boom")} />
      </ErrorBoundary>
    );
    expect(screen.queryByText("child rendered")).toBeNull();
  });

  it("shows the reload button in the fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom error={new Error("boom")} />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button")).toBeDefined();
  });
});
