import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("simplifies Hokei and opts its cards into larger text in Dojo mode", () => {
    const { container } = renderPractice(
      <FreePractice
        myGrade="5 kyū"
        allGradePlans={embuPlans}
        activeArea="hokei"
        onAreaChange={() => undefined}
        onBack={() => undefined}
        dojoMode
      />,
    );

    const areaHeader = screen.getByRole("heading", { name: "Hokei" }).closest("header")!;
    expect(within(areaHeader).queryByText("Sök och välj tekniker att träna.")).toBeNull();
    expect(container.querySelector(".free-practice-hokei.dojo-readable-hokei")).not.toBeNull();
    expect(container.querySelectorAll(".free-practice-hokei .dojo-card")).toHaveLength(2);
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

  it("removes setup copy and enlarges the Kihon hierarchy in Dojo mode", () => {
    const { container } = renderPractice(
      <FreePractice
        myGrade="2 kyū"
        allGradePlans={plans}
        activeArea="kihon"
        onAreaChange={() => undefined}
        onBack={() => undefined}
        dojoMode
      />,
    );

    const areaHeader = screen.getByRole("heading", { name: "Kihon" }).closest("header")!;
    expect(within(areaHeader).queryByText("Grundträning och återkommande övningar.")).toBeNull();
    expect(screen.queryByText("Den här sidan är fortfarande under utformning och kan ändras när som helst.")).toBeNull();
    expect(container.querySelector(".kihon-practice-proposal.is-dojo-mode")).not.toBeNull();
    expect(screen.getByText("furiko zuki")).toBeTruthy();
    expect(screen.queryByText("6 kyū")).toBeNull();
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

  it("simplifies Tan'en and Sōtai and opts their content into larger Dojo text", () => {
    const { container } = renderPractice(
      <FreePractice
        myGrade="2 kyū"
        allGradePlans={plans}
        activeArea="tanen-sotai"
        onAreaChange={() => undefined}
        onBack={() => undefined}
        dojoMode
      />,
    );

    const areaHeader = screen.getByRole("heading", { name: "Tan'en och sōtai" }).closest("header")!;
    expect(within(areaHeader).queryByText("Träna befintliga former med videostöd.")).toBeNull();
    expect(container.querySelector(".free-practice-form-groups.is-dojo-mode")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tan'en" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sōtai" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /YouTube/ })).toHaveLength(16);
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

  it("keeps Randori restrictions but removes grades and source context in Dojo mode", () => {
    const { container } = renderPractice(
      <FreePractice
        myGrade="5 kyū"
        allGradePlans={randoriPlans}
        activeArea="randori"
        onAreaChange={() => undefined}
        onBack={() => undefined}
        dojoMode
      />,
    );

    const areaHeader = screen.getByRole("heading", { name: "Randori" }).closest("header")!;
    expect(within(areaHeader).queryByText("Välj bland randori-teman från kamoku.")).toBeNull();
    expect(container.querySelector(".randori-practice-groups.is-dojo-mode")).not.toBeNull();

    const gohoSection = screen.getByRole("heading", { name: "gōhō" }).closest("section")!;
    expect(within(gohoSection).getByText("grundläggande gōhō-steg")).toBeTruthy();
    expect(within(gohoSection).getByText("avancerat gōhō-steg")).toBeTruthy();
    expect(gohoSection.textContent).not.toContain("5 kyū");
    expect(gohoSection.textContent).not.toContain("1 kyū");
    expect(screen.queryByText("Från Shodan anger Kamokuhyo randori utan ett mer detaljerat delsteg.")).toBeNull();
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
    expect(document.querySelector(".embu-progress")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för hela embun" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Kumi-embu" })).toBeNull();
    expect(document.querySelectorAll(".embu-sequence")).toHaveLength(6);
    expect(screen.getByText("Välj din första teknik")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    let search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));
    expect(screen.getByRole("button", { name: "Visa detaljer för sekvens 1" })).toBeTruthy();
    expect(screen.queryByText("kōgeki: zuki")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "shita");
    await user.click(screen.getByRole("option", { name: /shita uke geri/i }));
    const shitaHandle = screen.getByRole("button", { name: "Flytta shita uke geri" });
    shitaHandle.focus();
    await user.keyboard("{Enter}");
    const moveMenu = screen.getByRole("group", { name: "Flytta shita uke geri" });
    await user.click(within(moveMenu).getByRole("button", { name: "Upp" }));

    await user.click(screen.getByRole("button", { name: "Visa detaljer för sekvens 1" }));
    expect(screen.getByText("kōgeki: zuki")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Lägg till kommentar till shita uke geri" }));
    await user.type(
      screen.getByRole("textbox", { name: "Kommentar till shita uke geri" }),
      "Byt sida lugnt{enter}Arbeta med rytmen",
    );
    await user.click(screen.getByRole("button", { name: "Spara" }));

    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 2" }));
    search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 2" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));

    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences).toHaveLength(6);
    expect(saved.sequences[0].hokeis.map(hokei => hokei.hokeiName)).toEqual(["shita uke geri", "gyaku gote"]);
    expect(saved.sequences[0].hokeis[0].comment).toBe("Byt sida lugnt\nArbeta med rytmen");
    expect(saved.sequences[1].hokeis.map(hokei => hokei.hokeiName)).toEqual(["gyaku gote"]);
    expect(saved.sequences.slice(2).every(sequence => sequence.hokeis.length === 0)).toBe(true);
    expect(screen.queryByRole("button", { name: /Flytta sekvens/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Kommentar efter sekvens/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för hela embun" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Visa detaljer för sekvens 1" }));
    const displayedComment = screen.getByText((_, element) =>
      element?.classList.contains("inline-note-text") === true);
    expect(displayedComment.textContent).toBe("Byt sida lugnt\nArbeta med rytmen");
    const compactNoteLine = displayedComment.closest(".embu-hokei-note-line") as HTMLElement;
    expect(within(compactNoteLine).getByText("kōgeki: zuki")).toBeTruthy();
    expect(compactNoteLine.querySelector(".inline-note.has-note")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Redigera kommentar till shita uke geri" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dölj detaljer för sekvens 1" }));
    expect(screen.queryByText((_, element) =>
      element?.classList.contains("inline-note-text") === true)).toBeNull();
    expect(screen.getByText("Har kommentar")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Träna embun" }));
    expect(screen.getByText("1.")).toBeTruthy();
    expect(screen.getByText((_, element) =>
      element?.classList.contains("embu-practice-comment") === true
      && element.textContent === "Byt sida lugnt\nArbeta med rytmen")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Föregående" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Nästa" }));
    expect(screen.getByText("2.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Redigera embun" }));
    expect(screen.getByRole("button", { name: "Träna embun" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Embu och kumi-embu" }));
    expect(screen.getByRole("button", { name: "Skapa embu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Träna embun" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Träna kumi-embu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alla träningsområden" })).toBeTruthy();
  });

  it("finishes the builder after six sequences", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));

    for (let sequence = 1; sequence <= 6; sequence += 1) {
      await user.click(screen.getByRole("button", { name: `Lägg till hokei i sekvens ${sequence}` }));
      const search = screen.getByRole("combobox", { name: `Välj hokei till sekvens ${sequence}` });
      await user.type(search, "gyak");
      await user.click(screen.getByRole("option", { name: /gyaku gote/i }));
    }

    expect(screen.getByRole("button", { name: "Visa detaljer för sekvens 6" })).toBeTruthy();
    expect(document.querySelector(".embu-progress")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nästa sekvens" })).toBeNull();
    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences).toHaveLength(6);
  });

  it("moves a technique between fixed sequences with a visible drop preview", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));
    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    await user.type(screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" }), "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));

    const handle = screen.getByRole("button", { name: "Flytta gyaku gote" }) as HTMLButtonElement;
    const secondSequence = document.querySelectorAll<HTMLElement>(".embu-sequence")[1];
    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(secondSequence);

    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 20, clientY: 80 });
    expect(document.querySelector(".embu-drag-preview")).not.toBeNull();
    expect(secondSequence.classList.contains("is-drop-target")).toBe(true);
    expect(secondSequence.querySelector(".embu-drop-indicator")).not.toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 20, clientY: 80 });
    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences[0].hokeis).toHaveLength(0);
    expect(saved.sequences[1].hokeis.map(hokei => hokei.hokeiName)).toEqual(["gyaku gote"]);
    expect(document.querySelector(".embu-drag-preview")).toBeNull();
  });

  it("offers a tap and keyboard alternative for moving between sequences", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));
    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    await user.type(screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" }), "shita");
    await user.click(screen.getByRole("option", { name: /shita uke geri/i }));

    const handle = screen.getByRole("button", { name: "Flytta shita uke geri" });
    handle.focus();
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("group", { name: "Flytta shita uke geri" });
    await user.click(within(menu).getByRole("button", { name: "Flytta shita uke geri till sekvens 4" }));

    const saved = JSON.parse(localStorage.getItem(experimentalEmbuDraftStorageKey)!) as EmbuDraft;
    expect(saved.sequences[0].hokeis).toHaveLength(0);
    expect(saved.sequences[3].hokeis.map(hokei => hokei.hokeiName)).toEqual(["shita uke geri"]);
  });

  it("uses a technique name to expand planning details without opening a hokei card", async () => {
    const user = userEvent.setup();
    renderPractice(<EmbuHarness />);
    await user.click(screen.getByRole("button", { name: "Skapa embu" }));

    await user.click(screen.getByRole("button", { name: "Lägg till hokei i sekvens 1" }));
    const search = screen.getByRole("combobox", { name: "Välj hokei till sekvens 1" });
    await user.type(search, "gyak");
    await user.click(screen.getByRole("option", { name: /gyaku gote/i }));
    const techniqueName = screen.getByRole("button", { name: /^gyaku gote$/i });
    expect(techniqueName.getAttribute("aria-expanded")).toBe("false");
    await user.click(techniqueName);

    expect(techniqueName.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("kōgeki: migi ryote yubi")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lägg till kommentar till gyaku gote" })).toBeTruthy();
    expect(document.querySelector(".hokei-card")).toBeNull();

    await user.click(techniqueName);
    expect(screen.queryByText("kōgeki: migi ryote yubi")).toBeNull();
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

  it("presents Kumi-embu with larger, simplified content in Dojo mode", async () => {
    const user = userEvent.setup();
    const { container } = renderPractice(
      <FreePractice
        myGrade="nidan"
        allGradePlans={kumiEmbuLinkPlans}
        activeArea="embu"
        onAreaChange={() => undefined}
        onBack={() => undefined}
        dojoMode
      />,
    );

    const areaHeader = screen.getByRole("heading", { name: "Embu" }).closest("header")!;
    expect(within(areaHeader).queryByText("Bygg en egen embu eller träna en färdig sekvens.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Träna kumi-embu" }));
    expect(container.querySelector(".embu-kumi-example.is-dojo-mode")).not.toBeNull();
    expect(container.querySelector(".embu-detail-view.dojo-readable-hokei")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Visa teknik Tai ten ichi/i })).toBeTruthy();
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
    expect(screen.queryByText("Den här sidan är fortfarande under utformning och kan ändras när som helst.")).toBeNull();
    expect(screen.queryByText("Från 6 kyū")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Alla träningsområden" }));

    await user.click(screen.getByRole("button", { name: /Embu och kumi-embu/i }));
    expect(screen.getByTestId("global-state").textContent).toBe("1 kyū|true");
    expect(screen.queryByRole("combobox", { name: "Grad" })).toBeNull();
  });
});
