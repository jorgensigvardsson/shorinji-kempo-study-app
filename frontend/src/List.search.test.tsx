import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { GradePlan } from "./data";
import List from "./List";

const plan: GradePlan = { grade: "6 kyū", weeks: [] };

it("dismisses the mobile keyboard when Enter submits a technique search", async () => {
  const user = userEvent.setup();
  render(<List grade={plan} allGradePlans={[plan]} />);

  const search = screen.getByRole<HTMLInputElement>("searchbox");
  expect(search.getAttribute("enterkeyhint")).toBe("search");

  await user.type(search, "gyaku");
  expect(document.activeElement).toBe(search);

  await user.keyboard("{Enter}");

  expect(search.value).toBe("gyaku");
  expect(document.activeElement).not.toBe(search);
});
