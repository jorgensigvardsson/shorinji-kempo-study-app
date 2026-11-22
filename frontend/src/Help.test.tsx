import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Help from "./Help";
import { TranslatorContext, TranslatorImplementation, type Language } from "./i18n";
import type { GradePlan } from "./data";
import { getRoutes } from "./routes";
import en from "./assets/translations.en.json";
import ja from "./assets/translations.ja.json";
import tr from "./assets/translations.tr.json";

const translations = { en, ja, tr };
const renderHelp = (language: Language = "sv") => render(
    <MemoryRouter initialEntries={["/help"]}>
        <TranslatorContext.Provider value={new TranslatorImplementation(translations, language)}>
            <Help />
        </TranslatorContext.Provider>
    </MemoryRouter>,
);

describe("Help", () => {
    it("explains the grade setting, Kamokuhyō source and personal additions", async () => {
        const user = userEvent.setup();
        renderHelp();

        expect(screen.getByRole("button", { name: "Namn, grad och inställningar", expanded: false })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Namn, grad och inställningar" }));

        expect(screen.getByRole("button", { name: "Namn, grad och inställningar", expanded: true })).toBeTruthy();
        expect(screen.getByText(/Gradinställningen hjälper appen att välja relevanta tekniker/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Inställningar" }).getAttribute("href")).toBe("/settings");

        await user.click(screen.getByRole("button", { name: "Hokei – din teknikträning" }));

        expect(screen.getByRole("button", { name: "Hokei – din teknikträning", expanded: true })).toBeTruthy();
        expect(screen.getByText(/Teknikinnehållet i Hokei och veckoplanen kommer från Kamokuhyō/)).toBeTruthy();
        expect(screen.getByText(/Dina anteckningar och självskattningar är personliga tillägg/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Hokei" }).getAttribute("href")).toBe("/kamoku/free/hokei");
    });

    it("explains voluntary notification setup through the existing Settings page", async () => {
        const user = userEvent.setup();
        renderHelp();

        await user.click(screen.getByRole("button", { name: "Nyheter via pushnotiser" }));

        expect(screen.getByText(/Öppna Inställningar → Notiser och välj Aktivera notiser/)).toBeTruthy();
        expect(screen.getByText("Aktivera notiser på varje enhet där du vill få dem.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Inställningar för notiser" }).getAttribute("href")).toBe("/settings");
    });

    it("presents quiz and flashcards separately from training and Dojo mode", () => {
        renderHelp();

        expect(screen.queryByRole("heading", { name: "Träning eller teori" })).toBeNull();
        for (const title of ["Träna med Dojo-läge", "Quiz", "Flashkort"]) {
            expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
        }
        expect(screen.getByRole("link", { name: "Quiz" }).getAttribute("href")).toBe("/quiz");
        expect(screen.getByRole("link", { name: "Flashkort" }).getAttribute("href")).toBe("/flashcard");
        expect(screen.getByRole("link", { name: "Veckans träning" }).getAttribute("href")).toBe("/kamoku/plan");
    });

    it("follows the existing availability of study tools in Japanese", () => {
        renderHelp("ja");

        expect(screen.getByRole("heading", { level: 1, name: "アプリの使い方" })).toBeTruthy();
        const links = [...document.querySelectorAll("a")].map(link => link.getAttribute("href"));
        expect(links).toContain("/settings");
        expect(links).toContain("/kamoku/free/hokei");
        expect(links).not.toContain("/quiz");
        expect(links).not.toContain("/flashcard");
    });

    it.each<Language>(["sv", "en", "tr", "ja"])("keeps Help in the menu in %s independently of the welcome", language => {
        const plan: GradePlan = { grade: "6 kyū", weeks: [] };
        const translator = new TranslatorImplementation(translations, language);
        const routes = getRoutes(plan, plan, "minarai", [plan], translator, 1, () => {}, () => {}, () => {}, false);
        const help = routes.find(route => route.path === "/help");

        expect(help?.element).toBeTruthy();
        expect(help?.menuText).toBe(translator.translate("Hjälp"));
        expect(help?.hideFromMenu).not.toBe(true);
        expect(help?.hideOnStartPage).toBe(true);
    });
});
