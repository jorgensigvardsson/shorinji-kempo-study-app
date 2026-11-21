import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { BrowserStateScope } from "../browser-state";
import Start from "../Start";
import Help from "../Help";
import { getAppDataStore } from "../persistence/store";

function AppPages({ account = "one" }: { account?: string }) {
    return <BrowserStateScope.Provider value={account}>
        <nav aria-label="Meny"><Link to="/help">Hjälp</Link></nav>
        <Routes>
            <Route path="/" element={<Start routes={[]} />} />
            <Route path="/help" element={<Help />} />
        </Routes>
    </BrowserStateScope.Provider>;
}

const renderApp = (account = "one", initialEntry = "/") => render(
    <MemoryRouter initialEntries={[initialEntry]}><AppPages account={account} /></MemoryRouter>,
);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "");
});

describe("Getting started", () => {
    it("waits for the signed-in account before offering a persistent dismissal", () => {
        renderApp("preview");

        expect(screen.queryByRole("complementary", { name: "Kom igång med appen" })).toBeNull();
    });

    it("keeps the welcome until explicitly dismissed, including after reading the guide", async () => {
        const user = userEvent.setup();
        renderApp();

        expect(screen.getByRole("complementary", { name: "Kom igång med appen" })).toBeTruthy();
        await user.click(screen.getByRole("link", { name: "Öppna guiden" }));
        expect(screen.getByRole("heading", { level: 1, name: "Kom igång med appen" })).toBeTruthy();

        await user.click(screen.getByRole("button", { name: "Tillbaka" }));

        expect(screen.getByRole("complementary", { name: "Kom igång med appen" })).toBeTruthy();
    });

    it("also welcomes existing accounts with study data and a previously dismissed notification prompt", () => {
        const store = getAppDataStore();
        const original = store.getDocument();
        try {
            store.setDocument({ ...original, data: {
                ...original.data,
                currentGrade: "3 kyū",
                grade: "2 kyū",
                notes: { "tsuki nuki [soto]": "Min sparade anteckning" },
                quizStreakHighScore: 12,
            } });
            const saved = store.getDocument();
            localStorage.setItem("notifications-prompt-dismissed", "true");
            localStorage.setItem("lastSeenVersion", "2026-11-04T13:29:54.000Z");

            renderApp("existing-account");

            const welcome = screen.getByRole("complementary", { name: "Kom igång med appen" });
            expect(welcome.textContent).toContain("Aktivera gärna pushnotiser för nyheter om appen.");
            expect(store.getDocument()).toEqual(saved);
            expect(localStorage.getItem("notifications-prompt-dismissed")).toBe("true");
        } finally {
            store.setDocument(original);
        }
    });

    it("explains where Help remains and remembers dismissal after remounting", async () => {
        const user = userEvent.setup();
        const app = renderApp();

        await user.click(screen.getByRole("button", { name: "Ta bort Kom igång från startsidan" }));

        expect(await screen.findByRole("dialog", { name: "Hjälpen finns kvar" })).toBeTruthy();
        expect(screen.getByText("Öppna menyn Mer och välj Hjälp när du vill läsa guiden igen.")).toBeTruthy();
        expect(screen.queryByRole("complementary", { name: "Kom igång med appen" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "OK" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        app.unmount();
        renderApp();

        expect(screen.queryByRole("complementary", { name: "Kom igång med appen" })).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();
        await user.click(screen.getByRole("link", { name: "Hjälp" }));
        expect(screen.getByRole("heading", { level: 1, name: "Kom igång med appen" })).toBeTruthy();
    });

    it("keeps another account's welcome available on the same browser", async () => {
        const user = userEvent.setup();
        const first = renderApp("one");
        await user.click(screen.getByRole("button", { name: "Ta bort Kom igång från startsidan" }));
        first.unmount();

        renderApp("two");

        expect(screen.getByRole("complementary", { name: "Kom igång med appen" })).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does not change the synced study document when dismissing the welcome", async () => {
        const document = JSON.stringify({ notes: { "tsuki nuki [soto]": "Min anteckning" }, grade: "3 kyū" });
        localStorage.setItem("app-data-document", document);
        const user = userEvent.setup();
        renderApp();

        await user.click(screen.getByRole("button", { name: "Ta bort Kom igång från startsidan" }));

        expect(localStorage.getItem("app-data-document")).toBe(document);
    });
});
