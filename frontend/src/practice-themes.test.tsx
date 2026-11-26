import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPracticeQuizPool, practiceThemes, practiceWord, type PracticeTheme } from "./practice-themes";
import { drawQuestion } from "./quiz-logic";
import PracticeQuiz from "./PracticeQuiz";
import Flashcard from "./Flashcard";
import dictionary from "./assets/word-list.json";
import { getAppDataStore } from "./persistence/store";
import { TranslatorImplementation } from "./i18n";
import en from "./assets/translations.en.json";
import ja from "./assets/translations.ja.json";
import tr from "./assets/translations.tr.json";

const themes: PracticeTheme[] = ["commands", "body"];
const quizThemes: { theme: PracticeTheme; count: number }[] = [
    { theme: "commands", count: 20 }, { theme: "body", count: 20 }, { theme: "footwork", count: 9 },
];
beforeEach(() => {
    localStorage.clear();
    getAppDataStore().set("knownFlashCards", {});
    vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

it.each(quizThemes)("keeps $theme to $count reviewed meaning questions with three distinct translated choices", ({ theme, count }) => {
    const material = practiceThemes[theme];
    expect(material.wordIds).toHaveLength(count);
    expect(new Set(material.wordIds).size).toBe(count);
    const pool = buildPracticeQuizPool(theme);
    expect(pool.candidates).toHaveLength(count);
    const languages = [new TranslatorImplementation({ en, ja, tr }, "sv"),
        ...(["en", "ja", "tr"] as const).map(language => new TranslatorImplementation({ en, ja, tr }, language))];
    for (const candidate of pool.candidates) {
        const question = drawQuestion({ candidates: [candidate], domainOptions: pool.domainOptions })!;
        expect(question.alternatives).toHaveLength(3);
        expect(question.alternatives[question.correctAnswer]).toBe(candidate.correctAnswer);
        expect(question.question).toBe('Vad betyder "{0}"?');
        const id = Number(candidate.id.split(".").at(-1));
        expect(question.questionArgs).toEqual([practiceWord(id).romaji]);
        for (const translator of languages) {
            expect(new Set(question.alternatives.map(value => translator.translate(value))).size).toBe(3);
        }
    }
    for (const language of [en, ja, tr]) {
        const keys = new Set(Object.keys(language).map(key => key.toLowerCase()));
        for (const key of [material.title, material.description, ...material.wordIds.flatMap(id => practiceWord(id).meanings)])
            expect(keys.has(key.toLowerCase()), key).toBe(true);
    }
});

it("keeps potentially overlapping greetings out of each other's answer choices", () => {
    const greetings = new Set([6, 9, 10, 12, 31]);
    for (const [id, ...wrongIds] of practiceThemes.commands.questions) {
        if (greetings.has(id)) expect(wrongIds.some(wrongId => greetings.has(wrongId))).toBe(false);
    }
});

it.each(quizThemes)("runs the $theme quiz with romaji, three choices and the usual answer flow", async ({ theme }) => {
    const user = userEvent.setup();
    render(<PracticeQuiz theme={theme} />);
    const firstWord = practiceWord(practiceThemes[theme].wordIds[0]);
    expect(screen.getByRole("heading", { level: 1, name: practiceThemes[theme].title })).toBeTruthy();
    expect(screen.getByRole("heading", { name: `Vad betyder "${firstWord.romaji}"?` })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    await user.click(screen.getByRole("radio", { name: firstWord.meanings[0] }));
    await user.click(screen.getByRole("button", { name: "Svara" }));
    expect(screen.getByText("Rätt svar", { exact: false })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Nästa fråga" }));
    expect(screen.getAllByRole("radio")).toHaveLength(3);
});

it.each(quizThemes)("ends the $theme round after $count distinct questions and waits for an explicit restart", async ({ theme, count }) => {
    const user = userEvent.setup();
    render(<PracticeQuiz theme={theme} />);
    const seen = new Set<string>();
    for (let index = 0; index < count; index++) {
        expect(screen.getByText(`Fråga ${index + 1} av ${count}`)).toBeTruthy();
        const prompt = screen.getByRole("heading", { level: 2 }).textContent!;
        expect(seen.has(prompt)).toBe(false);
        seen.add(prompt);
        const candidate = buildPracticeQuizPool(theme).candidates.find(candidate => prompt.includes(`"${candidate.questionArgs[0]}"`))!;
        expect(candidate).toBeTruthy();
        await user.click(screen.getByRole("radio", { name: candidate.correctAnswer }));
        await user.click(screen.getByRole("button", { name: "Svara" }));
        await user.click(screen.getByRole("button", { name: index === count - 1 ? "Visa resultat" : "Nästa fråga" }));
    }
    expect(seen.size).toBe(count);
    expect(screen.getByRole("heading", { name: "Omgången klar!" })).toBeTruthy();
    expect(screen.getByText(`Du fick ${count} av ${count} rätt.`)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nästa fråga" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Öva igen" }));
    expect(screen.getByText(`Fråga 1 av ${count}`)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
});

it("counts wrong and revealed answers accurately and clears the result on restart", async () => {
    const user = userEvent.setup();
    render(<PracticeQuiz theme="commands" />);
    const pool = buildPracticeQuizPool("commands");
    for (let round = 0; round < 2; round++) {
        for (let index = 0; index < 20; index++) {
            const prompt = screen.getByRole("heading", { level: 2 }).textContent!;
            const candidate = pool.candidates.find(candidate => prompt.includes(`"${candidate.questionArgs[0]}"`))!;
            const correct = screen.getByRole("radio", { name: candidate.correctAnswer });
            if (round === 1 || index === 2) {
                // Selecting the right answer and then revealing it still earns no point.
                await user.click(correct);
                await user.click(screen.getByRole("button", { name: "Visa svar" }));
            } else {
                const answer = index < 2 ? screen.getAllByRole("radio").find(option => option !== correct)! : correct;
                await user.click(answer);
                await user.click(screen.getByRole("button", { name: "Svara" }));
            }
            await user.click(screen.getByRole("button", { name: index === 19 ? "Visa resultat" : "Nästa fråga" }));
        }
        expect(screen.getByText(`Du fick ${round === 0 ? 17 : 0} av 20 rätt.`)).toBeTruthy();
        if (round === 0) await user.click(screen.getByRole("button", { name: "Öva igen" }));
    }
});

it.each(themes)("shows the same twenty %s words as romaji-first flashcards and keeps their numeric identities", async theme => {
    const user = userEvent.setup();
    render(<Flashcard deck={theme} />);
    screen.getByRole("group").focus();
    for (const word of dictionary.filter(word => practiceThemes[theme].wordIds.includes(word.id))) {
        expect(screen.getByRole("heading", { level: 2, name: word.romaji })).toBeTruthy();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("heading", { level: 2, name: word.meanings![0] })).toBeTruthy();
        await user.keyboard("{ArrowRight}");
    }
    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    expect(Object.keys(getAppDataStore().get("knownFlashCards")).sort())
        .toEqual(practiceThemes[theme].wordIds.map(String).sort());
});

it.each(themes)("respects existing learned words and resets only the %s theme", async theme => {
    const user = userEvent.setup();
    const store = getAppDataStore();
    const known = { known: true, updatedAt: "2026-11-26T13:00:00.000Z" };
    store.set("knownFlashCards", {
        ...Object.fromEntries(practiceThemes[theme].wordIds.map(id => [String(id), known])),
        "1": known, "hokei:test": known, "kamae:gasshō gamae": known,
    });
    render(<Flashcard deck={theme} />);
    expect(screen.getByRole("heading", { name: "Alla kort klara!" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Börja om" }));
    const progress = store.get("knownFlashCards");
    expect(practiceThemes[theme].wordIds.every(id => progress[String(id)].known === false)).toBe(true);
    for (const id of ["1", "hokei:test", "kamae:gasshō gamae"]) expect(progress[id]).toEqual(known);
});
