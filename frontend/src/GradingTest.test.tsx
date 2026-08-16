import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import GradingTest from "./GradingTest";
import type { GradeName, GradePlan } from "./data";
import { getAppDataStore } from "./persistence/store";

vi.mock("./assets/grading-exam-information.json", () => ({
  default: {
    "6 kyū": {
      title: "Gradering",
      sections: [
        {
          term: { romaji: "gakka kamoku" },
          title: "teoretiska ämnen",
          // Tickable items carry an id, as they do in the real manual: it is what
          // the completion is stored against. These have no term, so their ids are
          // the frozen positional ones the keys used to be derived from.
          items: [
            {
              id: "item-0",
              text: "Teoretiskt provämne",
              items: [{ text: "Teoretisk underdel" }],
            },
            { id: "item-1", text: "Skriftligt prov" },
            { id: "item-2", text: "Muntligt prov" },
          ],
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
          {
            term: { romaji: "kiso kamoku" },
            points: 100,
            items: [
              {
                id: "tai gamae, tai sabaki, umpohō",
                term: { romaji: "tai gamae, tai sabaki, umpohō" },
                points: 10,
                techniqueGroups: [
                  { techniques: [{ romaji: "chūdan gamae" }] },
                  { techniques: [{ romaji: "zen tenkan" }] },
                  { techniques: [{ romaji: "chidori ashi" }] },
                ],
              },
              {
                id: "ukemi",
                term: { romaji: "ukemi" },
                points: 10,
                techniqueGroups: [{ techniques: [{ romaji: "mae ukemi" }] }],
              },
              {
                id: "kihon kōgi",
                term: { romaji: "kihon kōgi" },
                points: 10,
                techniqueGroups: [{ techniques: [{ romaji: "furiko zuki" }] }],
              },
              {
                id: "tan'en kihon hōkei",
                term: { romaji: "tan'en kihon hōkei" },
                points: 40,
                techniqueGroups: [{ techniques: [{ romaji: "tenchi ken dai ikkei" }] }],
              },
            ],
          },
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

beforeEach(() => {
  getAppDataStore().set("gradingFundamentalCompletions", {});
  getAppDataStore().set("gradingTheoryCompletions", {});
});

describe("GradingTest subject split", () => {
  it("shows only theoretical subjects under Theory", () => {
    renderGrading("theory");

    expect(screen.getByText("Teoretiskt provämne")).toBeTruthy();
    expect(screen.getByText("Skriftligt prov")).toBeTruthy();
    expect(screen.getByText("Muntligt prov")).toBeTruthy();
    expect(screen.queryByText("Tekniskt provämne")).toBeNull();
  });

  it("saves completion for large theory areas and updates the heading progress", async () => {
    const user = userEvent.setup();
    renderGrading("theory");

    expect(screen.getByLabelText("0 av 3 delar klarmarkerade")).toBeTruthy();
    const completion = screen.getByRole("checkbox", {
      name: "Klarmarkera Teoretiskt provämne",
    });

    await user.click(completion);

    expect((completion as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("1 av 3 delar klarmarkerade")).toBeTruthy();
    expect(getAppDataStore().get("gradingTheoryCompletions")["6 kyū|item-0"]).toBeTruthy();

    await user.click(completion);

    expect((completion as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText("0 av 3 delar klarmarkerade")).toBeTruthy();
    expect(getAppDataStore().get("gradingTheoryCompletions")).toEqual({});
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

  it("groups fundamentals into a clean outline without dropping their techniques", async () => {
    const user = userEvent.setup();
    const { container } = renderGrading("technical", "3 kyū");

    await user.click(screen.getByRole("button", { name: /Grunder/ }));

    expect(screen.getByLabelText("0 av 4 delar klarmarkerade")).toBeTruthy();
    expect(screen.getByText("Rörelse och säkerhet")).toBeTruthy();
    expect(screen.getByText("Angrepp och försvar")).toBeTruthy();
    expect(screen.getByText("Hōkei")).toBeTruthy();
    expect(container.querySelectorAll(".grading-completion-circle")).toHaveLength(4);
    expect(screen.queryByText("chūdan gamae")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Kroppsställning, kroppsföring och fotförflyttning/ }));

    expect(screen.getByText("Kroppsställningar")).toBeTruthy();
    expect(screen.getByText("Kroppsföring")).toBeTruthy();
    expect(screen.getByText("Fotförflyttning")).toBeTruthy();
    expect(screen.getByText("chūdan gamae")).toBeTruthy();
    expect(screen.getByText("zen tenkan")).toBeTruthy();
    expect(screen.getByText("chidori ashi")).toBeTruthy();
  });

  it("saves each fundamentals completion and updates the heading progress", async () => {
    const user = userEvent.setup();
    renderGrading("technical", "3 kyū");

    await user.click(screen.getByRole("button", { name: /Grunder/ }));

    expect(screen.getByLabelText("0 av 4 delar klarmarkerade")).toBeTruthy();
    const completion = screen.getByRole("checkbox", {
      name: "Klarmarkera Kroppsställning, kroppsföring och fotförflyttning",
    });

    await user.click(completion);

    expect((completion as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("1 av 4 delar klarmarkerade")).toBeTruthy();
    expect(getAppDataStore().get("gradingFundamentalCompletions")["3 kyū|tai gamae, tai sabaki, umpohō"]).toBeTruthy();

    await user.click(completion);

    expect((completion as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText("0 av 4 delar klarmarkerade")).toBeTruthy();
    expect(getAppDataStore().get("gradingFundamentalCompletions")).toEqual({});
  });
});
