import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HokeiMoment } from "../data";
import type { PersistenceBackend } from "../persistence/backend";
import { createDefaultAppDataDocument, type AppDataDocument } from "../persistence/schema";
import { AppDataStore, getAppDataStore } from "../persistence/store";
import { TranslatorContext, TranslatorImplementation } from "../i18n";
import HokeiCard from "./HokeiCard";

vi.mock("../persistence/store", async importOriginal => ({
  ...(await importOriginal<typeof import("../persistence/store")>()),
  getAppDataStore: vi.fn(),
}));

vi.mock("../hooks", () => ({
  useTheme: () => ({ effectiveTheme: "light" }),
}));

const hokei: HokeiMoment = {
  id: "gyaku gote",
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
  videos: [{ url: "https://www.youtube.com/watch?v=test" }],
};

const makeStore = (withNotes = true, note = "Remember the angle") => {
  const initial = createDefaultAppDataDocument();
  const document: AppDataDocument = {
    ...initial,
    data: {
      ...initial.data,
      notes: withNotes ? { "gyaku gote": note } : {},
      hokeiRanks: { "gyaku gote": { value: 2, updatedAt: initial.updatedAt } },
      showKanjiOnHokeiCards: false,
    },
  };
  const backend: PersistenceBackend<AppDataDocument> = {
    load: () => document,
    save: () => undefined,
  };
  return new AppDataStore(backend);
};

describe("HokeiCard training layouts", () => {
  it("expands in the page flow without turning into a focused full-screen card", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(<HokeiCard hokei={hokei} kamokuLayout />);

    const card = container.querySelector(".hokei-card")!;
    const header = container.querySelector<HTMLElement>(".card-header")!;
    expect(card.classList.contains("is-collapsed")).toBe(true);

    await user.click(header);

    expect(card.classList.contains("is-expanded")).toBe(true);
    expect(card.classList.contains("focus-card")).toBe(false);
    expect(document.body.classList.contains("card-focus-active")).toBe(false);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    await user.click(container.querySelector<HTMLElement>(".kamoku-card-role-action")!);
    expect(card.classList.contains("is-collapsed")).toBe(true);
  });

  it("keeps variations, role details, references, notes, videos, and ratings in the calm layout", () => {
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(
      <HokeiCard
        hokei={hokei}
        gradeName="6 kyū"
        showNotes
        showRating
        kamokuLayout
        defaultOpen
      />,
    );

    const content = container.textContent ?? "";
    expect(content).toContain("katate");
    expect(content).toContain("jūhō");
    expect(content).toContain("Kyohan");
    expect(content).toContain("123");
    expect(content).toContain("Angripare");
    expect(content).toContain("Försvarare");
    expect(content).toContain("YouTube");
    expect(content).not.toContain("Fotposition");
    expect(content).not.toContain("Kamae");
    expect(content).not.toContain("Utförande");
    expect(content).not.toContain("Stans");
    expect(content).toContain("hidari mae chūdan gamae");
    expect(content).toContain("Remember the angle");
    expect(screen.getByRole("group", { name: "Självskattning" })).toBeTruthy();

    const roleRows = container.querySelectorAll(".kamoku-card-role-row");
    expect(roleRows).toHaveLength(2);
    expect(roleRows[0].textContent).toContain("migi mae chūdan gamae");
    expect(roleRows[0].textContent).toContain("jōdan zuki");
    expect(roleRows[1].textContent).toContain("hidari mae chūdan gamae");
    expect(roleRows[1].textContent).toContain("gyaku gote");
  });

  it("keeps the grade visible and shows the group and reference only when opened", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(
      <HokeiCard hokei={hokei} gradeName="6 kyū" showRating kamokuLayout />,
    );

    const header = container.querySelector<HTMLElement>(".card-header")!;
    const body = container.querySelector(".card-body")!;
    expect(header.textContent).toContain("6 kyū");
    expect(header.textContent).toContain("katate");
    expect(header.textContent).not.toContain("jūhō");
    expect(header.textContent).toContain("Övar");
    expect(header.textContent).not.toContain("Kyohan");
    expect(header.querySelector(".self-assessment")).not.toBeNull();
    expect(body.querySelector(".self-assessment")).toBeNull();
    expect(container.querySelector(".card-footer")?.textContent ?? "").not.toContain("Kyohan");

    await user.click(header);
    const metadata = header.querySelector(".kamoku-card-metadata")!;
    expect(metadata.textContent).toContain("6 kyū");
    expect(metadata.textContent).toContain("jūhō");
    expect(metadata.textContent).toContain("Kyohan 123");

    await user.click(header);
    expect(header.textContent).toContain("6 kyū");
    expect(header.textContent).not.toContain("jūhō");
    expect(header.textContent).not.toContain("Kyohan");
  });

  it("keeps dojo content simple, names the roles and protects notes from content-click collapse", async () => {
    const user = userEvent.setup();
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const translator = new TranslatorImplementation({ ja: { "gyaku gote": "逆小手" } }, "sv");
    const { container } = render(
      <TranslatorContext.Provider value={translator}>
        <HokeiCard
          hokei={hokei}
          gradeName="6 kyū"
          showNotes
          showRating
          dojoMode
          defaultOpen
        />
      </TranslatorContext.Provider>,
    );

    const content = container.textContent ?? "";
    expect(content).toContain("katate");
    expect(content).toContain("jōdan zuki");
    expect(content).toContain("Angripare");
    expect(content).toContain("Försvarare");
    expect(content).not.toContain("jūhō");
    expect(content).not.toContain("Kyohan 123");
    expect(content).not.toContain("6 kyū");
    expect(content).not.toContain("逆小手");
    expect(screen.queryByRole("group", { name: "Självskattning" })).toBeNull();
    expect(container.querySelector(".hokei-inline-note.has-note")).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för gyaku gote" })).toBeNull();

    await user.click(screen.getByText("Remember the angle"));
    expect(container.querySelector(".dojo-card.is-expanded")).not.toBeNull();
    await user.click(container.querySelector<HTMLElement>(".dojo-foot-images")!);
    expect(container.querySelector(".dojo-card.is-collapsed")).not.toBeNull();
  });

  it("shows kanji in the standard view even when the legacy preference was off", () => {
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const translator = new TranslatorImplementation({ ja: { "gyaku gote": "逆小手" } }, "sv");
    const { container } = render(
      <TranslatorContext.Provider value={translator}>
        <HokeiCard hokei={hokei} kamokuLayout />
      </TranslatorContext.Provider>,
    );

    expect(container.textContent).toContain("逆小手");
  });

  it("uses Japanese as the primary dojo text when Japanese is the interface language", () => {
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const translator = new TranslatorImplementation({
      ja: { "gyaku gote": "逆小手", katate: "片手" },
    }, "ja");
    const { container } = render(
      <TranslatorContext.Provider value={translator}>
        <HokeiCard
          hokei={hokei}
        showNotes
        showRating
          dojoMode
        />
      </TranslatorContext.Provider>,
    );

    expect(container.textContent).toContain("逆小手");
    expect(container.textContent).toContain("片手");
  });

  it("uses a calm notes label when no note has been saved", () => {
    const store = makeStore(false);
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(
      <HokeiCard hokei={hokei} showNotes kamokuLayout />,
    );

    expect(container.textContent).toContain("Anteckningar");
    expect(container.textContent).not.toContain("Lägg till anteckningar");
  });

  it("opens the compact saved note for editing only after the pencil is selected", async () => {
    const user = userEvent.setup();
    const store = makeStore(true, "Första raden\nAndra raden");
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(
      <HokeiCard hokei={hokei} showNotes kamokuLayout defaultOpen />,
    );

    expect(container.querySelector(".hokei-inline-note.has-note:not(.is-editing)")).not.toBeNull();
    expect(screen.getByText((_, element) =>
      element?.classList.contains("inline-note-text") === true
      && element.textContent === "Första raden\nAndra raden")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Anteckningar för gyaku gote" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Redigera anteckningar för gyaku gote" }));
    const textarea = screen.getByRole("textbox", { name: "Anteckningar för gyaku gote" });
    expect(textarea.getAttribute("rows")).toBe("2");
    await user.clear(textarea);
    await user.type(textarea, "Ny första rad{enter}Ny andra rad");
    await user.click(screen.getByRole("button", { name: "Spara" }));

    expect(store.get("notes")["gyaku gote"]).toBe("Ny första rad\nNy andra rad");
    expect(screen.queryByRole("textbox", { name: "Anteckningar för gyaku gote" })).toBeNull();
    expect(screen.getByText((_, element) =>
      element?.classList.contains("inline-note-text") === true
      && element.textContent === "Ny första rad\nNy andra rad")).toBeTruthy();
  });

  it("draws the kamoku footer video link without a box of its own", () => {
    const store = makeStore();
    vi.mocked(getAppDataStore).mockReturnValue(store);
    const { container } = render(
      <HokeiCard
        hokei={{ ...hokei, videos: [{ url: "https://www.youtube.com/watch?v=example" }] }}
        showNotes
        kamokuLayout
      />,
    );

    const link = container.querySelector(".kamoku-video-link")!;
    expect(link.className).toBe("kamoku-video-link");
    expect(screen.getByRole("link", { name: "YouTube" })).toBeTruthy();
  });
});
