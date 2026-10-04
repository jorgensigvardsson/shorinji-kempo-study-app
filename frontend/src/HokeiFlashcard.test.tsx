import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { getAllHokeiMoments, type GradePlan, type HokeiMoment } from "./data";
import HokeiFlashcard from "./HokeiFlashcard";
import kamokuhyo from "./assets/kamokuhyo.json";
import { TranslatorContext, TranslatorImplementation } from "./i18n";
import { getAppDataStore } from "./persistence/store";

const hokei: HokeiMoment = {
    id: "gyaku gote",
    type: "hokei_moment",
    hokei_name: "gyaku gote",
    ren_hanko: false,
    variations: [],
    technique_group: "ryūō ken dai ikkei",
    foot_stance: ["tai gamae"],
    roles: {
        attacker: { stance: "migi mae chūdan gamae", action: "migi te kubi o nigiru" },
        defender: { stance: "hidari mae chūdan gamae", action: "gyaku gote" },
    },
    kyohan_pages: [],
};

const plan: GradePlan = {
    grade: "6 kyū",
    weeks: [{ week: 1, type: "regular_week", moments: [hokei] }],
};

const hokei5Kyu: HokeiMoment = {
    ...hokei,
    id: "uchi uke zuki",
    hokei_name: "uchi uke zuki",
};

const plan5Kyu: GradePlan = {
    grade: "5 kyū",
    weeks: [{ week: 1, type: "regular_week", moments: [hokei5Kyu] }],
};

beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("notes", {});
    getAppDataStore().set("notesUpdatedAt", {});
    getAppDataStore().set("knownFlashCards", {});
});

it("shows a hokei name on the front and details with editable notes on the back", async () => {
    const user = userEvent.setup();
    const translator = new TranslatorImplementation({ ja: { "gyaku gote": "逆小手" } }, "sv");
    const { container } = render(
        <TranslatorContext.Provider value={translator}>
            <HokeiFlashcard allGradePlans={[plan]} myGrade="6 kyū" />
        </TranslatorContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "逆小手" })).toBeDefined();
    expect(container.querySelector(".flashcard-hokei-romaji")?.textContent).toBe("gyaku gote");
    expect(screen.queryByText("Hokei")).toBeNull();
    expect(screen.queryByText("Framsida")).toBeNull();
    expect(screen.queryByText("Tryck för att vända")).toBeNull();
    await user.click(screen.getByRole("heading", { name: "逆小手" }));
    expect(container.querySelector(".flashcard-scene")?.classList.contains("is-flipped")).toBe(true);
    expect(screen.queryByText("Uppställning")).toBeNull();
    expect(screen.queryByText("Utförande")).toBeNull();
    expect(screen.queryByText("Baksida")).toBeNull();
    expect(screen.queryByText("Tryck för att vända tillbaka")).toBeNull();
    expect(container.querySelector<HTMLImageElement>(".dojo-foot-images .stance-icon")?.getAttribute("src")).toContain("tai_gamae");
    expect(screen.getByText("migi mae chūdan gamae")).toBeDefined();
    expect(screen.getByText("migi te kubi o nigiru")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Lägg till anteckningar för gyaku gote" }));
    const note = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Anteckningar för gyaku gote" });
    await user.type(note, "Träna lugnare");
    expect(container.querySelector(".flashcard-scene")?.classList.contains("is-flipped")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Spara" }));

    expect(getAppDataStore().get("notes")["gyaku gote"]).toBe("Träna lugnare");
});


it("uses horizontal swipes instead of action buttons during hokei practice", async () => {
    render(<HokeiFlashcard allGradePlans={[plan]} myGrade="6 kyū" />);

    expect(screen.queryByRole("button", { name: "Kan det" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nästa kort" })).toBeNull();
    expect(screen.getByText("← Öva igen")).toBeDefined();
    expect(screen.getByText("Kan det →")).toBeDefined();

    const deck = screen.getByRole("group", {
        name: "Svep vänster för att öva igen eller höger om du kan det.",
    });
    fireEvent.pointerDown(deck, { pointerId: 1, clientX: 20, clientY: 100 });
    fireEvent.pointerMove(deck, { pointerId: 1, clientX: 140, clientY: 102 });
    fireEvent.pointerUp(deck, { pointerId: 1, clientX: 140, clientY: 102 });

    await waitFor(() => {
        expect(getAppDataStore().get("knownFlashCards")["hokei:gyaku gote"]?.known).toBe(true);
    });
});

it("keeps learned word cards when restarting the hokei deck", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("knownFlashCards", {
        "1": { known: true, updatedAt: "2026-09-11T10:00:00.000Z" },
        "hokei:gyaku gote": { known: true, updatedAt: "2026-09-11T10:00:00.000Z" },
    });
    render(<HokeiFlashcard allGradePlans={[plan]} myGrade="6 kyū" />);

    await user.click(screen.getByRole("button", { name: "Börja om" }));

    expect(getAppDataStore().get("knownFlashCards")["1"].known).toBe(true);
    expect(getAppDataStore().get("knownFlashCards")["hokei:gyaku gote"].known).toBe(false);
});
it("shows progress per grade and can reset every Hokei card without resetting word cards", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("knownFlashCards", {
        "1": { known: true, updatedAt: "2026-09-11T10:00:00.000Z" },
        "hokei:gyaku gote": { known: true, updatedAt: "2026-09-11T10:00:00.000Z" },
    });
    render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);

    expect(screen.getByRole("button", { name: "Framsteg 0/1" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Framsteg 0/1" }));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("6 kyū1/1 · Trygg");
    expect(rows[1].textContent).toContain("5 kyū0/1 · Bra att öva");

    await user.click(screen.getByRole("button", { name: "Återställ alla Hokei-kort" }));
    expect(screen.getByRole("heading", { name: "Återställa alla Hokei-kort?" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Återställ" }));

    const progress = getAppDataStore().get("knownFlashCards");
    expect(progress["1"].known).toBe(true);
    expect(progress["hokei:gyaku gote"].known).toBe(false);
    expect(progress["hokei:uchi uke zuki"].known).toBe(false);
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("0/1 · Bra att öva");
});

it("opens directly at the user's grade and changes grade through the shared picker", async () => {
    const user = userEvent.setup();
    render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);

    expect(screen.queryByRole("heading", { name: /Gyaku gote/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /Uchi uke zuki/i })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Tränar inför 5 kyū" }));
    expect(screen.getByRole("button", { name: "Framsteg 0/1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Alla grader" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Alla till och med 5 kyū" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "6 kyū" }));

    expect(screen.getByRole("button", { name: "Tränar inför 6 kyū" })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Gyaku gote/i })).toBeDefined();
    expect(screen.queryByRole("heading", { name: /Uchi uke zuki/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Framsteg 0/1" })).toBeDefined();
});

it("returns to the new training grade when the profile grade changes", () => {
    const { rerender } = render(
        <HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />,
    );

    expect(screen.getByRole("button", { name: "Tränar inför 5 kyū" })).toBeDefined();

    rerender(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="6 kyū" />);

    expect(screen.getByRole("button", { name: "Tränar inför 6 kyū" })).toBeDefined();
});

it("uses the confirmed Kamoku classification for Kihon, Zeme and Hagai jime", () => {
    const ids = (kamokuhyo as GradePlan[]).flatMap(getAllHokeiMoments).map(moment => moment.id);

    expect(ids).not.toContain("kōbōgi (furi zuki & kusshin uke)");
    expect(ids).toContain("jitsugetsu zeme");
    expect(ids).toContain("hagai jime to shuhō");
});

it("remembers the chosen grade on this device when the user comes back", async () => {
    const user = userEvent.setup();
    const first = render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);
    await user.click(screen.getByRole("button", { name: "Tränar inför 5 kyū" }));
    await user.click(screen.getByRole("button", { name: "6 kyū" }));
    first.unmount();

    render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);
    expect(screen.getByRole("button", { name: "Tränar inför 6 kyū" })).toBeDefined();
    expect(screen.getByRole("heading", { name: /Gyaku gote/i })).toBeDefined();
});

it("does not carry a remembered grade over to a new training grade", async () => {
    const user = userEvent.setup();
    const first = render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);
    await user.click(screen.getByRole("button", { name: "Tränar inför 5 kyū" }));
    await user.click(screen.getByRole("button", { name: "Alla grader" }));
    first.unmount();

    render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="6 kyū" />);
    expect(screen.getByRole("button", { name: "Tränar inför 6 kyū" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: /Uchi uke zuki/i })).toBeNull();
});
