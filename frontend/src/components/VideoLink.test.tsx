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
});
