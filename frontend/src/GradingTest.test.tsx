import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import GradingTest from "./GradingTest";
import type { GradeName, GradePlan } from "./data";

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
          items: [
            {
              text: "Tekniskt provämne",
              description: "Övergripande beskrivning",
              points: 10,
              annotations: [{ marker: "asterisk", text: "Viktig anmärkning" }],
              items: [{
                text: "Teknisk underdel",
                description: "Beskrivning av underdel",
                techniqueGroups: [{
                  context: { text: "Valbara tekniker" },
                  techniques: [{ romaji: "uchi uke" }],
                }],
              }],
              videos: [{ url: "https://youtu.be/example", label: "Demonstration" }],
            },
            { text: "Andra teknikområdet" },
          ],
        },
      ],
    },
    "3 kyū": {
      title: "Gradering",
      sections: [{
        term: { romaji: "gijutsu kamoku" },
        title: "tekniska ämnen",
        items: [
          { term: { romaji: "kiso kamoku" }, items: [] },
          { term: { romaji: "chūshutsu kamoku" }, items: [] },
          { term: { romaji: "kumi embu" }, items: [] },
          { term: { romaji: "un'yōhō" }, items: [] },
        ],
      }],
    },
  },
}));

const plans = [{ grade: "6 kyū", weeks: [] }, { grade: "3 kyū", weeks: [] }] as GradePlan[];

const HistoryProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>App back</button>
      <output data-testid="location">{location.pathname}{location.search}</output>
    </>
  );
};

const renderGrading = (subject: "theory" | "technical", grade: GradeName = "6 kyū") => render(
  <MemoryRouter initialEntries={["/training", "/training/grading"]} initialIndex={1}>
    <HistoryProbe />
    <GradingTest
      subject={subject}
      grade={grade}
      allGradePlans={plans}
    />
  </MemoryRouter>,
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

  it("opens a technical category without duplicating or dropping its details", async () => {
    const user = userEvent.setup();
    renderGrading("technical");

    expect(screen.getByText("Tekniska ämnen")).toBeTruthy();
    expect(screen.getByText("Andra teknikområdet")).toBeTruthy();
    expect(screen.queryByText("Övergripande beskrivning")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Tekniskt provämne/ }));

    expect(screen.getByText("Tekniska ämnen")).toBeTruthy();
    expect(screen.queryByText("Andra teknikområdet")).toBeNull();
    expect(screen.getByText("Övergripande beskrivning")).toBeTruthy();
    expect(screen.getByText(/Viktig anmärkning/)).toBeTruthy();
    expect(screen.getByText("Demonstration")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Teknisk underdel/ }));

    expect(screen.getByText("Beskrivning av underdel")).toBeTruthy();
    expect(screen.getByText("Valbara tekniker")).toBeTruthy();
    expect(screen.getByText("uchi uke")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "App back" }));

    expect(screen.getByText("Andra teknikområdet")).toBeTruthy();
    expect(screen.queryByText("Övergripande beskrivning")).toBeNull();
  });

  it("builds the technical category menu from the selected grade", () => {
    renderGrading("technical", "3 kyū");

    expect(screen.getByRole("button", { name: /Grunder/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Utvalda tekniker/ })).toBeTruthy();
    const embuButton = screen.getByRole("button", { name: /Embu/ });
    expect(embuButton.classList.contains("app-grid-card")).toBe(true);
    expect(embuButton.closest(".start-grid")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Tillämpning/ })).toBeTruthy();
    expect(screen.queryByText("Tekniskt provämne")).toBeNull();
  });

  it("treats an opened technical category as exactly one back step", async () => {
    const user = userEvent.setup();
    renderGrading("technical", "3 kyū");

    await user.click(screen.getByRole("button", { name: /Grunder/ }));

    expect(screen.getByTestId("location").textContent).toContain("gradingCategory=");
    expect(screen.queryByRole("button", { name: /Utvalda tekniker/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "App back" }));

    expect(screen.getByTestId("location").textContent).toBe("/training/grading");
    expect(screen.getByRole("button", { name: /Utvalda tekniker/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "App back" }));
    expect(screen.getByTestId("location").textContent).toBe("/training");
  });
});
