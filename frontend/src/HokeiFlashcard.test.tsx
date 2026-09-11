import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import type { GradePlan, HokeiMoment } from "./data";
import HokeiFlashcard from "./HokeiFlashcard";
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
    const { container } = render(<HokeiFlashcard allGradePlans={[plan]} myGrade="6 kyū" />);

    expect(screen.queryByRole("heading", { name: /Gyaku gote/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Nu kör vi" }));
    expect(screen.getByRole("heading", { name: /Gyaku gote/i })).toBeDefined();
    await user.click(screen.getByText("Tryck för att vända"));
    expect(container.querySelector(".flashcard-scene")?.classList.contains("is-flipped")).toBe(true);
    expect(screen.queryByText("Uppställning")).toBeNull();
    expect(screen.queryByText("Utförande")).toBeNull();
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
    const user = userEvent.setup();
    render(<HokeiFlashcard allGradePlans={[plan]} myGrade="6 kyū" />);

    await user.click(screen.getByRole("button", { name: "Nu kör vi" }));
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

    await user.click(screen.getByRole("button", { name: "Nu kör vi" }));
    await user.click(screen.getByRole("button", { name: "Börja om" }));

    expect(getAppDataStore().get("knownFlashCards")["1"].known).toBe(true);
    expect(getAppDataStore().get("knownFlashCards")["hokei:gyaku gote"].known).toBe(false);
});

it("shows confidence per grade and lets the user practise selected grades", async () => {
    const user = userEvent.setup();
    getAppDataStore().set("knownFlashCards", {
        "hokei:uchi uke zuki": { known: true, updatedAt: "2026-09-11T10:00:00.000Z" },
    });
    render(<HokeiFlashcard allGradePlans={[plan, plan5Kyu]} myGrade="5 kyū" />);

    expect(screen.getByText("0/1 · Bra att öva")).toBeDefined();
    expect(screen.getByText("1/1 · Trygg")).toBeDefined();
    expect(screen.queryByRole("heading", { name: /Gyaku gote/i })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Öva 6 kyū" }));
    await user.click(screen.getByRole("button", { name: "Nu kör vi" }));
    expect(screen.getByRole("heading", { name: /Alla kort klara/i })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Ändra grader" }));
    await user.click(screen.getByRole("checkbox", { name: "Öva 5 kyū" }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Nu kör vi" }).disabled).toBe(true);
});
