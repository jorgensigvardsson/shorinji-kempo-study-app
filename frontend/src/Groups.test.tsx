import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { GradePlan, HokeiMoment } from "./data";
import Groups from "./Groups";

vi.mock("./components/HokeiCard", () => ({
  default: ({ hokei, className, showNotes, showRating, kamokuLayout }: {
    hokei: HokeiMoment;
    className?: string;
    showNotes?: boolean;
    showRating?: boolean;
    kamokuLayout?: boolean;
  }) => (
    <div
      className={className}
      data-testid="group-hokei"
      data-notes={String(showNotes)}
      data-rating={String(showRating)}
      data-kamoku-layout={String(kamokuLayout)}
    >
      {hokei.hokei_name}
    </div>
  ),
}));

const hokei = (id: string, techniqueGroup: string): HokeiMoment => ({
  id,
  type: "hokei_moment",
  hokei_name: id,
  ren_hanko: false,
  variations: [],
  technique_group: techniqueGroup,
  foot_stance: [],
  roles: { attacker: {}, defender: {} },
  kyohan_pages: [],
});

const plan: GradePlan = {
  grade: "6 kyū",
  weeks: [{
    week: 1,
    type: "regular_week",
    moments: [hokei("gyaku gote", "ryūō ken"), hokei("kote nuki", "ryūō ken"), hokei("uchi uke zuki", "nió ken")],
  }],
};

beforeEach(() => localStorage.clear());

it("keeps the calm group overview and uses the established cards inside a group", async () => {
  const user = userEvent.setup();
  const { container } = render(<Groups allGradePlans={[plan]} />);

  expect(container.querySelector(".groups-grid")).not.toBeNull();
  expect(container.querySelectorAll(".groups-grid .groups-count")).toHaveLength(2);
  expect(container.querySelector(".groups-count-badge")).toBeNull();

  await user.click(screen.getByRole("button", { name: /ryūō ken/i }));

  expect(screen.getByRole("button", { name: "Teknikgrupper" })).toBeTruthy();
  expect(container.querySelector(".groups-back svg")).toBeNull();
  expect(screen.getAllByTestId("group-hokei")).toHaveLength(2);
  for (const card of screen.getAllByTestId("group-hokei")) {
    expect(card.classList.contains("m-1")).toBe(true);
    expect(card.getAttribute("data-notes")).toBe("true");
    expect(card.getAttribute("data-rating")).toBe("true");
    expect(card.getAttribute("data-kamoku-layout")).toBe("undefined");
  }

  await user.click(screen.getByRole("button", { name: "Teknikgrupper" }));
  expect(container.querySelector(".groups-grid")).not.toBeNull();
});
