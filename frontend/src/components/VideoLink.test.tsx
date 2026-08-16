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

  it("keeps the box unless the caller asks for the plain look", () => {
    const { container, rerender } = render(
      <VideoLink video={{ url: "https://www.youtube.com/watch?v=example" }} className="mt-3" />
    );

    expect(container.firstElementChild?.className).toBe("p-2 border border-primary rounded mt-3");

    rerender(<VideoLink video={{ url: "https://www.youtube.com/watch?v=example" }} className="mt-3" plain />);

    expect(container.firstElementChild?.className).toBe("mt-3");
    expect(screen.getByText("YouTube")).toBeTruthy();
  });
});
