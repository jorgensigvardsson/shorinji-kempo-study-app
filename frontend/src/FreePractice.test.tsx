import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GradePlan } from "./data";
import FreePractice from "./FreePractice";
import { experimentalEmbuDraftStorageKey, type EmbuDraft } from "./persistence/experimental-embu-draft";
import type { PracticeArea } from "./practice-area";

const plans: GradePlan[] = [
  { grade: "1 kyū", weeks: [] },
  { grade: "2 kyū", weeks: [] },
];

const renderPractice = (ui: ReactNode) => render(
  <MemoryRouter>
    {ui}
  </MemoryRouter>,
);

const FreePracticeHarness = () => {
  const [activeArea, setActiveArea] = useState<PracticeArea | null>(null);
  const [myGrade, setMyGrade] = useState<"1 kyū" | "2 kyū">("2 kyū");
  const [dojoMode, setDojoMode] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setMyGrade("1 kyū")}>Testa global grad 1 kyū</button>
      <button type="button" onClick={() => setDojoMode(current => !current)}>Testa globalt träningsläge</button>
      <output data-testid="global-state">{myGrade}|{String(dojoMode)}</output>
      <FreePractice
        myGrade={myGrade}
        allGradePlans={plans}
        activeArea={activeArea}
        onAreaChange={setActiveArea}
        onBack={() => setActiveArea(null)}
        dojoMode={dojoMode}
      />
    </>
  );
};

const randoriPlans: GradePlan[] = [
  {
    grade: "shodan",
    weeks: [{
      week: 1,
      type: "regular_week",
      moments: [{ type: "standard_moment", content: ["randori"] }],
    }],
  },
  {
    grade: "1 kyū",
    weeks: [{
      week: 1,
      type: "regular_week",
      moments: [{ type: "standard_moment", content: ["randori"], randori: "gōhō", restrictions: "avancerat gōhō-steg" }],
    }],
  },
  {
    grade: "5 kyū",
    weeks: [{
      week: 1,
      type: "regular_week",
      moments: [
        { type: "standard_moment", content: ["randori"], randori: "gōhō", restrictions: "grundläggande gōhō-steg" },
        { type: "standard_moment", content: ["randori"], randori: "jūhō", restrictions: "grundläggande jūhō-steg" },
      ],
    }],
  },
  {
    grade: "4 kyū",
    weeks: [{
      week: 1,
      type: "regular_week",
      moments: [{ type: "standard_moment", content: ["randori"], randori: "gōhō", restrictions: "grundläggande gōhō-steg" }],
    }],
  },
];

const RandoriHarness = () => (
  <FreePractice
    myGrade="5 kyū"
    allGradePlans={randoriPlans}
    activeArea="randori"
    onAreaChange={() => undefined}
    onBack={() => undefined}
    dojoMode={false}
  />
);

const embuPlans: GradePlan[] = [{
  grade: "5 kyū",
  weeks: [{
    week: 3,
    type: "regular_week",
    moments: [
      {
        type: "hokei_moment",
        hokei_name: "gyaku gote",
        ren_hanko: false,
        variations: [],
        technique_group: "ryūka ken",
        foot_stance: [],
        roles: { attacker: { action: "migi ryote yubi" }, defender: { action: "gyaku gote" } },
        kyohan_pages: [164],
      },
      {
        type: "hokei_moment",
        hokei_name: "shita uke geri",
        ren_hanko: false,
        variations: [],
        technique_group: "nió ken",
        foot_stance: [],
        roles: { attacker: { action: "zuki" }, defender: { action: "shita uke geri" } },
        kyohan_pages: [80],
      },
    ],
  }],
}];

const EmbuHarness = () => (
  <FreePractice
    myGrade="5 kyū"
    allGradePlans={embuPlans}
    activeArea="embu"
    onAreaChange={() => undefined}
    onBack={() => undefined}
    dojoMode={false}
  />
);

const kumiEmbuLinkPlans: GradePlan[] = [{
  grade: "nidan",
  weeks: [{
    week: 1,
    type: "regular_week",
    moments: [
      {
        type: "hokei_moment",
        hokei_name: "tai ten ichi",
        ren_hanko: false,
        variations: [],
        technique_group: "tennō ken",
        foot_stance: [],
        roles: { attacker: { action: "zuki" }, defender: { action: "tai ten ichi" } },
        kyohan_pages: [100],
      },
      {
        type: "hokei_moment",
        hokei_name: "keri ten san",
        ren_hanko: false,
        variations: [],
        technique_group: "sambō ken",
        foot_stance: [],
        roles: { attacker: { action: "geri" }, defender: { action: "keri ten san" } },
        kyohan_pages: [101],
      },
    ],
  }],
}];

const KumiEmbuLinkHarness = () => (
  <FreePractice
    myGrade="nidan"
    allGradePlans={kumiEmbuLinkPlans}
    activeArea="embu"
    onAreaChange={() => undefined}
    onBack={() => undefined}
    dojoMode={false}
  />
);

beforeEach(() => {
  localStorage.removeItem(experimentalEmbuDraftStorageKey);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FreePractice", () => {
  it("offers calm entrances to all current practice areas", () => {
    renderPractice(<FreePracticeHarness />);

    expect(screen.getByRole("button", { name: /Kihon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Hokei/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tan'en och sōtai/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Randori/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Embu och kumi-embu/i })).toBeTruthy();
  });

  it("shows the proposed Kihon lists up to the selected grade", async () => {
    const user = userEvent.setup();
    renderPractice(<FreePracticeHarness />);

    await user.click(screen.getByRole("button", { name: /Kihon/i }));

    expect(screen.getByText("Den här sidan är fortfarande under utformning och kan ändras när som helst.")).toBeTruthy();
    expect(screen.queryByText(/Sensei/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Kaisoku dachi / Byakuren chūdan gamae" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hidari/migi mae" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Uke och kontring" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Kōbōgi och idō kōbōgi" })).toBeTruthy();
    expect(screen.getByText("furiko zuki")).toBeTruthy();
    expect(screen.getByText("sashikae sokutō geri")).toBeTruthy();
    expect(screen.getByText("uchi oshi uke geri")).toBeTruthy();
    expect(screen.queryByText("harai uke geri")).toBeNull();
    expect(screen.queryByText(/^Från (?:\d+ kyū|Shodan|Nidan|Sandan|Yondan|Godan)$/)).toBeNull();
    expect(screen.getAllByText("6 kyū").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Testa global grad 1 kyū" }));
    expect(screen.getByText("harai uke geri")).toBeTruthy();
    expect(screen.getByText("ren geri")).toBeTruthy();
  });

  it("groups all Tan'en and Sōtai forms by family without losing entries", async () => {
    const user = userEvent.setup();
    renderPractice(<FreePracticeHarness />);

    await user.click(screen.getByRole("button", { name: /Tan'en och sōtai/i }));

    const tanenSection = screen.getByRole("heading", { name: "Tan'en" }).closest("section")!;
    const sotaiSection = screen.getByRole("heading", { name: "Sōtai" }).closest("section")!;

    expect(within(tanenSection).getByRole("heading", { name: "Tenchi ken" })).toBeTruthy();
    expect(within(tanenSection).getByRole("heading", { name: "Giwa ken" })).toBeTruthy();
    expect(within(tanenSection).getByRole("heading", { name: "Ryūō ken" })).toBeTruthy();
    expect(within(tanenSection).getByRole("heading", { name: "Andra former" })).toBeTruthy();
    expect(within(tanenSection).getAllByRole("listitem")).toHaveLength(12);

    expect(within(sotaiSection).getByRole("heading", { name: "Tenchi ken" })).toBeTruthy();
    expect(within(sotaiSection).getByRole("heading", { name: "Giwa ken" })).toBeTruthy();
    expect(within(sotaiSection).getByRole("heading", { name: "Ryūō ken" })).toBeTruthy();
    expect(within(sotaiSection).queryByRole("heading", { name: "Andra former" })).toBeNull();
    expect(within(sotaiSection).getAllByRole("listitem")).toHaveLength(4);
  });

  it("does not repeat the form name inside its video link", async () => {
    const user = userEvent.setup();
    renderPractice(<FreePracticeHarness />);

    await user.click(screen.getByRole("button", { name: /Tan'en och sōtai/i }));

    const item = screen.getAllByRole("listitem")
      .find(li => li.textContent?.includes("tenchi ken dai ikkei (tan'en)"))!;

    expect(within(item).getAllByText("tenchi ken dai ikkei (tan'en)")).toHaveLength(1);
    expect(within(item).getByRole("link", { name: /YouTube/ })).toBeTruthy();
    expect(item.querySelector(".border")).toBeNull();
  });

  it("shows the complete Randori progression with Gōhō before Jūhō and first grades", () => {
    renderPractice(<RandoriHarness />);

    const gohoHeading = screen.getByRole("heading", { name: "gōhō" });
    const juhoHeading = screen.getByRole("heading", { name: "jūhō" });
    expect(gohoHeading.compareDocumentPosition(juhoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const gohoSection = gohoHeading.closest("section")!;
    const gohoSteps = within(gohoSection).getAllByRole("listitem");
    expect(gohoSteps).toHaveLength(2);
    expect(gohoSteps[0].textContent).toContain("grundläggande gōhō-steg");
    expect(gohoSteps[0].textContent).toContain("5 kyū");
    expect(gohoSteps[1].textContent).toContain("avancerat gōhō-steg");
    expect(gohoSteps[1].textContent).toContain("1 kyū");

    const juhoSection = juhoHeading.closest("section")!;
    expect(within(juhoSection).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Från Shodan anger Kamokuhyo randori utan ett mer detaljerat delsteg.")).toBeTruthy();
  });

  it("starts quietly and builds autosaved sequences with one or more hokei", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);

    expect(screen.getByRole("button", { name: "Skapa embu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Träna kumi-embu" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));

    expect(screen.queryByRole("button", { name: "Alla träningsområden" })).toBeNull();
    expect(screen.getByRole("button", { name: "Embu och kumi-embu" })).toBeTruthy();
    expect(screen.getByText("Experimentell").querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Det här är en prototyp. Utkastet sparas bara på den här enheten och kommer att försvinna när experimentfasen avslutas.")).toBeTruthy();
    expect(screen.getByText("Sekvens 1 av 6")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för hela embun" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Kumi-embu" })).toBeNull();

    let search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));

    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "shita");
    await user.click(screen.getByRole("option", { name: /shita uke geri/i }));
    await user.click(screen.getByRole("button", { name: "Flytta shita uke geri upp" }));

    expect(screen.getByText("kōgeki: zuki")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lägg till kommentar till shita uke geri" }));
    await user.type(
      screen.getByRole("textbox", { name: "Kommentar till shita uke geri" }),
      "Byt sida lugnt{enter}Arbeta med rytmen",
    );
    await user.click(screen.getByRole("button", { name: "Spara" }));

    await user.click(screen.getByRole("button", { name: "Nästa sekvens" }));
    search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 2" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));

    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences).toHaveLength(2);
    expect(saved.sequences[0].hokeis.map(hokei => hokei.hokeiName)).toEqual(["shita uke geri", "gyaku gote"]);
    expect(saved.sequences[0].hokeis[0].comment).toBe("Byt sida lugnt\nArbeta med rytmen");
    expect(saved.sequences[1].hokeis.map(hokei => hokei.hokeiName)).toEqual(["gyaku gote"]);
    expect(screen.queryByRole("textbox", { name: /Kommentar efter sekvens/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för hela embun" })).toBeNull();

    const displayedComment = screen.getByText((_, element) =>
      element?.classList.contains("inline-note-text") === true);
    expect(displayedComment.textContent).toBe("Byt sida lugnt\nArbeta med rytmen");
    const compactNoteLine = displayedComment.closest(".embu-hokei-note-line") as HTMLElement;
    expect(within(compactNoteLine).getByText("kōgeki: zuki")).toBeTruthy();
    expect(compactNoteLine.querySelector(".inline-note.has-note")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Redigera kommentar till shita uke geri" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Embu och kumi-embu" }));
    expect(screen.getByRole("button", { name: "Skapa embu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Träna kumi-embu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alla träningsområden" })).toBeTruthy();
  });

  it("finishes the builder after six sequences", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));

    for (let sequence = 1; sequence <= 6; sequence += 1) {
      const search = screen.getByRole("combobox", { name: `Välj hokei till sekvens ${sequence}` });
      await user.type(search, "gyak");
      await user.click(screen.getByRole("option", { name: /gyaku gote/i }));
      if (sequence < 6) await user.click(screen.getByRole("button", { name: "Nästa sekvens" }));
    }

    expect(screen.getByText("Sekvens 6 av 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nästa sekvens" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences).toHaveLength(6);
  });

  it("opens a selected embu technique as an inline expandable card", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));

    const search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));
    await user.click(screen.getByRole("button", { name: "Visa teknik gyaku gote" }));

    const card = document.querySelector<HTMLElement>(".hokei-card.is-expanded");
    expect(card).not.toBeNull();
    expect(card?.classList.contains("focus-card")).toBe(false);
    expect(document.body.classList.contains("card-focus-active")).toBe(false);

    const cardHeader = card?.querySelector<HTMLElement>(".card-header");
    expect(cardHeader?.getAttribute("aria-expanded")).toBe("true");
    await user.click(cardHeader!);
    await waitFor(() => expect(document.querySelector(".hokei-card")).toBeNull());
  });

  it("links both existing technique cards in a composite kumi-embu step", async () => {
    const user = userEvent.setup();
    renderPractice(<KumiEmbuLinkHarness />);

    await user.click(screen.getByRole("button", { name: "Träna kumi-embu" }));
    expect(screen.queryByRole("heading", { name: "Bygg embu" })).toBeNull();
    expect(screen.getByRole("button", { name: /Visa teknik Tai ten ichi/i })).toBeTruthy();
    const keriTenSan = screen.getByRole("button", { name: /Visa teknik Keri ten san/i });
    expect(keriTenSan).toBeTruthy();

    await user.click(keriTenSan);
    const card = document.querySelector<HTMLElement>(".hokei-card.is-expanded");
    expect(card).not.toBeNull();
    expect(document.body.classList.contains("card-focus-active")).toBe(false);

    await user.click(card!.querySelector<HTMLElement>(".card-header")!);
    await waitFor(() => expect(document.querySelector(".hokei-card")).toBeNull());
  });

  it("returns to all areas and keeps global grade and training mode for the session", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderPractice(<FreePracticeHarness />);

    await user.click(screen.getByRole("button", { name: /Embu och kumi-embu/i }));
    await user.click(screen.getByRole("button", { name: "Testa global grad 1 kyū" }));
    await user.click(screen.getByRole("button", { name: "Testa globalt träningsläge" }));

    await user.click(screen.getByRole("button", { name: "Alla träningsområden" }));
    expect(screen.getByRole("heading", { name: "Fri träning" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Kihon/i }));
    expect(screen.getByTestId("global-state").textContent).toBe("1 kyū|true");
    expect(screen.getByText("harai uke geri")).toBeTruthy();
    expect(screen.getByText("Den här sidan är fortfarande under utformning och kan ändras när som helst.")).toBeTruthy();
    expect(screen.queryByText("Från 6 kyū")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Alla träningsområden" }));

    await user.click(screen.getByRole("button", { name: /Embu och kumi-embu/i }));
    expect(screen.getByTestId("global-state").textContent).toBe("1 kyū|true");
    expect(screen.queryByRole("combobox", { name: "Grad" })).toBeNull();
  });
});
