import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradePlan, HokeiMoment } from "./data";
import Kamoku from "./Kamoku";
import { getAppDataStore } from "./persistence/store";
import gradePlans from "./assets/kamokuhyo.json";
import ja from "./assets/translations.ja.json";
import en from "./assets/translations.en.json";
import tr from "./assets/translations.tr.json";
import { TranslatorImplementation, type Language } from "./i18n";
import { weekIntroduction } from "./weekly-copy";

vi.mock("./components/HokeiCard", () => ({
  default: ({ gradeName, hokei }: { gradeName?: string; hokei: HokeiMoment }) => (
    <div data-testid="weekly-hokei" data-grade={gradeName ?? ""}>{hokei.hokei_name}</div>
  ),
}));

const hokei: HokeiMoment = {
  type: "hokei_moment",
  hokei_name: "gyaku gote",
  ren_hanko: false,
  variations: [],
  technique_group: "jūhō",
  foot_stance: [],
  roles: { attacker: {}, defender: {} },
  kyohan_pages: [],
};

const plan: GradePlan = {
  grade: "6 kyū",
  weeks: [{ week: 1, type: "regular_week", kihon_shoho: ["uwazeme"], moments: [hokei] }],
};

beforeEach(() => {
  getAppDataStore().set("weeklyPlanCompletions", {});
  getAppDataStore().set("showKanjiOnHokeiCards", false);
  getAppDataStore().set("currentWeekAnchor", null);
});

describe("Kamoku weekly plan", () => {
  it("uses the selected global grade without repeating it on every technique card", () => {
    render(<Kamoku myGrade="6 kyū" allGradePlans={[plan]} />);

    expect(screen.queryByRole("combobox", { name: "Grad" })).toBeNull();
    expect(screen.getByTestId("weekly-hokei").getAttribute("data-grade")).toBe("");
  });

  it("presents the weekly focus openly above the technique cards", () => {
    render(<Kamoku myGrade="6 kyū" allGradePlans={[plan]} />);

    expect(screen.getByRole("heading", { name: "Veckoplan" })).toBeTruthy();
    expect(screen.getByText("Veckans grundarbete rör sig kring kihon shohō. Gyaku gote står i centrum.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Veckans innehåll" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Veckans grundarbete" })).toBeTruthy();
    expect(screen.getByText("uwazeme")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tekniker" })).toBeTruthy();
    expect(screen.getByText("gyaku gote")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Kihon shohō, repetition, studier/i })).toBeNull();
    expect(document.body.classList.contains("card-focus-active")).toBe(false);
  });

  it("keeps exact randori restrictions, embu and repetition in the open overview", () => {
    const mixedPlan: GradePlan = {
      grade: "5 kyū",
      weeks: [{
        week: 1,
        type: "regular_week",
        kihon_shoho: ["shutō giri, yorimi", "principer för nukite"],
        moments: [
          hokei,
          {
            type: "standard_moment",
            content: ["randori", "embu", "repetition"],
            randori: "jūhō",
            restrictions: "nuki waza från seitai gamae",
          },
        ],
      }],
    };

    render(<Kamoku myGrade="5 kyū" allGradePlans={[mixedPlan]} />);

    expect(screen.getByText(/Randori i jūhō med fokus på nuki waza från seitai gamae/)).toBeTruthy();
    expect(screen.getByText("Randori · jūhō — nuki waza från seitai gamae · Embu · Repetition")).toBeTruthy();
    expect(screen.getByText("shutō giri, yorimi")).toBeTruthy();
    expect(screen.getByText("principer för nukite")).toBeTruthy();
  });

  it("uses every source item in a review and preparation week", () => {
    const reviewPlan: GradePlan = {
      grade: "nidan",
      weeks: [{
        week: 37,
        type: "review_preparation_week",
        content: ["repetition", "studier", "förberedelse inför gradering"],
      }],
    };

    render(<Kamoku myGrade="nidan" allGradePlans={[reviewPlan]} />);

    expect(screen.getByText("En vecka för att samla ihop det du arbetat med: repetition, studier och förberedelse inför gradering.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Veckans fokus" })).toBeTruthy();
    expect(screen.getByText("repetition")).toBeTruthy();
    expect(screen.getByText("studier")).toBeTruthy();
    expect(screen.getByText("förberedelse inför gradering")).toBeTruthy();
  });

  it("builds complete introductions for every source week in every language", () => {
    const plans = gradePlans as GradePlan[];
    const languages: Language[] = ["sv", "en", "tr", "ja"];

    for (const language of languages) {
      // Every section, rather than what the app loads at startup: this asserts against
      // real copy in each language, so each language's table has to be present.
      const translator = new TranslatorImplementation({ ja, en, tr }, language);
      for (const grade of plans) {
        for (const week of grade.weeks) {
          const introduction = weekIntroduction(week, translator);
          expect(introduction.trim(), `${language}: ${grade.grade}, week ${week.week}`).not.toBe("");
          expect(introduction, `${language}: ${grade.grade}, week ${week.week}`).not.toMatch(/\{\d+\}/);
        }
      }
    }
  });

  it("leaves grade and training mode to the global control", () => {
    const { container } = render(
      <Kamoku myGrade="6 kyū" allGradePlans={[plan]} />,
    );

    const controls = container.querySelector(".kamoku-controls");
    expect(controls?.querySelector("#kamoku-grade-select")).toBeNull();
    expect(controls?.querySelector("#dojo-mode")).toBeNull();
    expect(controls?.querySelector(".kamoku-week-navigation")).not.toBeNull();
    expect(screen.getByText("Vecka 1")).toBeTruthy();
    expect(screen.getByText("av 1")).toBeTruthy();
  });

  it("marks a grade week as practised and opens a stable editable completion panel", async () => {
    const user = userEvent.setup();
    render(<Kamoku myGrade="6 kyū" allGradePlans={[plan]} />);

    await user.click(screen.getByRole("button", { name: "Markera som tränad" }));

    const stored = getAppDataStore().get("weeklyPlanCompletions")["6 kyū|1"];
    expect(Number.isNaN(Date.parse(stored.completedAt))).toBe(false);
    const completed = screen.getByRole("button", { name: "Visa när vecka 1 klarmarkerades" });
    expect(screen.getByText("Tränad")).toBeTruthy();

    await user.hover(completed);
    expect((await screen.findByRole("dialog")).textContent).toContain("Klarmarkerad");

    await user.click(completed);
    await user.unhover(completed);
    expect(screen.getByRole("dialog").textContent).toContain("Klarmarkerad");

    await user.click(screen.getByRole("button", { name: "Ta bort klarmarkering" }));
    expect(getAppDataStore().get("weeklyPlanCompletions")).toEqual({});
    expect(screen.getByRole("button", { name: "Markera som tränad" })).toBeTruthy();
  });
});
