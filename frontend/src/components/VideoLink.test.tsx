import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VideoLink from "./VideoLink";

describe("VideoLink", () => {
  it("does not show the generic Video text next to the YouTube action", () => {
    render(<VideoLink video={{ url: "https://www.youtube.com/watch?v=example" }} />);

    expect(screen.queryByText("Video")).toBeNull();
    expect(screen.getByText("YouTube")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Video" })).toBeNull();
  });

  it("carries no framing of its own beyond the caller's class", () => {
    const { container } = render(
      <VideoLink video={{ url: "https://www.youtube.com/watch?v=example" }} className="mt-3" />
    );

    expect(container.firstElementChild?.className).toBe("mt-3");
    expect(screen.getByRole("link", { name: /YouTube/ })).toBeTruthy();
  });
});
