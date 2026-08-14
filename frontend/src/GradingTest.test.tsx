import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingTest from "./GradingTest";
import type { GradePlan } from "./data";

vi.mock("./hooks", () => ({
  useShowKanji: () => false,
}));

vi.mock("./assets/grading-exam-information.json", () => ({
  default: {
    "6 kyū": {
      title: "Gradering",
      sections: [
        {
          term: { romaji: "gakka kamoku" },
          title: "teoretiska ämnen",
          items: [{ text: "Teoretiskt provämne" }],
        },
        {
          term: { romaji: "gijutsu kamoku" },
          title: "tekniska ämnen",
          items: [{ text: "Tekniskt provämne" }],
        },
      ],
    },
  },
}));

const plans = [{ grade: "6 kyū", weeks: [] }] as GradePlan[];

const renderGrading = (subject: "theory" | "technical") => render(
  <GradingTest
    subject={subject}
    grade="6 kyū"
    allGradePlans={plans}
  />,
);

describe("GradingTest subject split", () => {
  it("shows only theoretical subjects under Theory", () => {
    renderGrading("theory");

    expect(screen.getByText("Teoretiskt provämne")).toBeTruthy();
    expect(screen.queryByText("Tekniskt provämne")).toBeNull();
  });

  it("shows only technical subjects under Training", () => {
    renderGrading("technical");

    expect(screen.getByText("Tekniskt provämne")).toBeTruthy();
    expect(screen.queryByText("Teoretiskt provämne")).toBeNull();
  });
});
