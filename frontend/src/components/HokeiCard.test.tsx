import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HokeiMoment } from "../data";
import { HokeiNotes, HokeiRanks } from "../persistence/app-data";
import type { PersistenceBackend } from "../persistence/backend";
import { createDefaultAppDataDocument, type AppDataDocument } from "../persistence/schema";
import { AppDataStore } from "../persistence/store";
import { TranslatorContext, TranslatorImplementation } from "../i18n";
import HokeiCard from "./HokeiCard";

const hookState = vi.hoisted(() => ({ showKanji: false }));

vi.mock("../hooks", () => ({
  useShowKanji: () => hookState.showKanji,
  useTheme: () => ({ effectiveTheme: "light" }),
}));

const hokei: HokeiMoment = {
  type: "hokei_moment",
  hokei_name: "gyaku gote",
  ren_hanko: false,
  variations: ["katate"],
  technique_group: "jūhō",
  foot_stance: ["hidari mae chūdan gamae"],
  roles: {
    attacker: { stance: "migi mae chūdan gamae", action: "jōdan zuki" },
    defender: { stance: "hidari mae chūdan gamae", action: "gyaku gote" },
  },
  kyohan_pages: [123],
};

const makeStore = (withNotes = true) => {
  const initial = createDefaultAppDataDocument();
  const document: AppDataDocument = {
    ...initial,
    data: {
      ...initial.data,
      notes: withNotes ? { "gyaku gote": "Remember the angle" } : {},
      hokeiRanks: { "gyaku gote": { value: 2, updatedAt: initial.updatedAt } },
    },
  };
  const backend: PersistenceBackend<AppDataDocument> = {
    load: () => document,
    save: () => undefined,
  };
  return new AppDataStore(backend);
};

describe("HokeiCard training layouts", () => {
  it("keeps variations, technique metadata, stance names, notes, and ratings in the calm layout", () => {
    const store = makeStore();
    const { container } = render(
      <HokeiCard
        hokei={hokei}
        gradeName="6 kyū"
        notesData={new HokeiNotes(store)}
        ranksData={new HokeiRanks(store)}
        kamokuLayout
      />,
    );

    const content = container.textContent ?? "";
    expect(content).toContain("katate");
    expect(content).toContain("jūhō");
    expect(content).toContain("Kyohan 123");
    expect(content).toContain("hidari mae chūdan gamae");
    expect(content).toContain("Mina anteckningar");
    expect(screen.getByRole("group", { name: "Självskattning" })).toBeTruthy();

    const roleRows = container.querySelectorAll(".kamoku-card-role-row");
    expect(roleRows).toHaveLength(2);
    expect(roleRows[0].textContent).toContain("migi mae chūdan gamae");
    expect(roleRows[0].textContent).toContain("jōdan zuki");
    expect(roleRows[1].textContent).toContain("hidari mae chūdan gamae");
    expect(roleRows[1].textContent).toContain("gyaku gote");
  });

  it("keeps only practice-essential header information in dojo mode and opens saved notes", () => {
    const store = makeStore();
    hookState.showKanji = true;
    const translator = new TranslatorImplementation({ ja: { "gyaku gote": "逆小手" } }, "sv");
    const { container } = render(
      <TranslatorContext.Provider value={translator}>
        <HokeiCard
          hokei={hokei}
          gradeName="6 kyū"
          notesData={new HokeiNotes(store)}
          ranksData={new HokeiRanks(store)}
          dojoMode
        />
      </TranslatorContext.Provider>,
    );
    hookState.showKanji = false;

    const content = container.textContent ?? "";
    expect(content).toContain("katate");
    expect(content).toContain("jōdan zuki");
    expect(content).not.toContain("jūhō");
    expect(content).not.toContain("Kyohan 123");
    expect(content).not.toContain("6 kyū");
    expect(content).not.toContain("逆小手");
    expect(screen.queryByRole("group", { name: "Självskattning" })).toBeNull();
    expect(container.querySelector(".hokei-notes-box.is-open")).not.toBeNull();
  });

  it("uses Japanese as the primary dojo text when Japanese is the interface language", () => {
    const store = makeStore();
    const translator = new TranslatorImplementation({
      ja: { "gyaku gote": "逆小手", katate: "片手" },
    }, "ja");
    const { container } = render(
      <TranslatorContext.Provider value={translator}>
        <HokeiCard
          hokei={hokei}
          notesData={new HokeiNotes(store)}
          ranksData={new HokeiRanks(store)}
          dojoMode
        />
      </TranslatorContext.Provider>,
    );

    expect(container.textContent).toContain("逆小手");
    expect(container.textContent).toContain("片手");
  });

  it("uses a calm notes label when no note has been saved", () => {
    const store = makeStore(false);
    const { container } = render(
      <HokeiCard hokei={hokei} notesData={new HokeiNotes(store)} kamokuLayout />,
    );

    expect(container.textContent).toContain("Anteckningar");
    expect(container.textContent).not.toContain("Lägg till anteckningar");
  });
});
