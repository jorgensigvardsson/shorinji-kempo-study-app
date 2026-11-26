import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Deepening from "./Deepening";
import StudyTopic from "./StudyTopic";
import { TheoryToolPage } from "./components/ToolPage";
import { TranslatorContext, TranslatorImplementation } from "./i18n";
import { studyTopics } from "./study-topics";
import { flattenStudySections, kihonIntroduction, studyMaterial } from "./study-material";
import { fixedOrganizationWordIds, kihonNodePath, kihonRoots, searchStudyContent, studyNodeId, studyWord } from "./study-content";
import type { KihonNode } from "./data";
import en from "./assets/translations.en.json";
import ja from "./assets/translations.ja.json";
import tr from "./assets/translations.tr.json";

const translations = { en, ja, tr };
const translator = new TranslatorImplementation(translations, "sv");
const flattenKihon = (nodes: KihonNode[]): KihonNode[] => nodes.flatMap(node => [node, ...flattenKihon(node.children ?? [])]);
function Probe() { const location = useLocation(); return <output data-testid="url">{location.pathname}{location.search}</output>; }
function mount(path: string) {
    return render(<MemoryRouter initialEntries={[path]}><Probe /><Routes>
        <Route path="/theory/deepening" element={<Deepening />} />
        <Route path="/theory/deepening/:topic" element={<StudyTopic />} />
        <Route path="/theory/groups" element={<div>Existing groups</div>} />
    </Routes></MemoryRouter>);
}
beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
});

describe("Further study navigation", () => {
    it("presents six distinct subjects and keeps the existing Technique groups URL", async () => {
        const user = userEvent.setup();
        mount("/theory/deepening");
        expect(screen.getAllByRole("button")).toHaveLength(6);
        for (const topic of studyTopics) expect(screen.getByRole("button", { name: new RegExp(topic.title) })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: /Teknikgrupper/ }));
        expect(screen.getByTestId("url").textContent).toBe("/theory/groups");
        expect(screen.getByText("Existing groups")).toBeTruthy();
    });

    it("opens an actual subject, and gives fresh deep links a parent in Further study", async () => {
        window.history.replaceState({ idx: 0 }, "");
        const user = userEvent.setup();
        render(<MemoryRouter initialEntries={["/theory/deepening/ranks"]}><Probe />
            <TheoryToolPage parent="/theory/deepening" parentLabel="Fördjupning"><div>Ranks</div></TheoryToolPage>
        </MemoryRouter>);
        expect(screen.getByRole("link", { name: "Fördjupning" }).getAttribute("href")).toBe("/theory/deepening");
        await user.click(screen.getByRole("button", { name: "Tillbaka" }));
        expect(screen.getByTestId("url").textContent).toBe("/theory/deepening");
        window.history.replaceState(null, "");
    });

    it("redirects an unknown subject to the overview", async () => {
        mount("/theory/deepening/unknown");
        expect(await screen.findByRole("heading", { name: "Fördjupning", level: 1 })).toBeTruthy();
    });
});

describe("Kihon source presentation", () => {
    it("keeps both complementary chapters below the selected Kihon material", () => {
        mount("/theory/deepening/movements");
        const kihon = screen.getByRole("region", { name: "Kihon – grunderna" });
        expect(within(kihon).getByRole("combobox", { name: "Välj område inom Kihon" })).toBeTruthy();
        expect(within(kihon).queryByRole("heading", { name: "Kroppspositioner" })).toBeNull();
        for (const title of ["Vanliga rörelser och övningar", "Kroppens delar och redskap"]) {
            expect(screen.getByRole("heading", { name: title, level: 2 })).toBeTruthy();
            expect(within(kihon).queryByRole("heading", { name: title })).toBeNull();
        }
        expect(screen.getByText("Källa: Yōgoshū (utkast), s. 14, 16–27.")).toBeTruthy();
    });

    it("groups both kamae families together and keeps Fujinhō outside that group", () => {
        mount("/theory/deepening/movements?group=tai+gamae+%5Bkihon%5D");
        const kamae = screen.getByRole("region", { name: "Kroppsställningar · Kamae" });
        expect(within(kamae).getByRole("heading", { level: 4, name: /byakuren hachi jin/ })).toBeTruthy();
        expect(within(kamae).getByRole("heading", { level: 4, name: /giwa kyū jin/ })).toBeTruthy();
        expect(within(kamae).queryByText("fujinhō")).toBeNull();
        const positions = screen.getByRole("region", { name: /Inbördes positioner/ });
        expect(within(positions).getByRole("heading", { level: 3 })).toBeTruthy();
        expect(within(positions).getByText("seitai gamae").closest("details")).toBeNull();
        expect(positions.querySelectorAll(".study-leaf")).toHaveLength(3);
    });

    it.each(kihonRoots)("keeps every source technique under $name", root => {
        const { container } = mount(`/theory/deepening/movements?${new URLSearchParams({ group: root.id })}`);
        const displayed = new Map([...container.querySelectorAll('[id^="study-node-"]')].map(element => [element.id, element]));
        for (const leaf of flattenKihon([root]).filter(node => node.kind === "technique")) {
            const row = displayed.get(studyNodeId(leaf.id));
            expect(row, leaf.id).toBeTruthy();
            expect(row?.textContent).toContain(leaf.name);
            expect(row?.textContent).toContain(leaf.description);
        }
    });

    it.each(kihonRoots)("preserves aliases, notes and footnotes in $name", root => {
        const { container } = mount(`/theory/deepening/movements?${new URLSearchParams({ group: root.id })}`);
        for (const node of flattenKihon([root])) {
            if (node.note) expect(container.textContent).toContain(node.note);
            if (node.footnote) expect(container.textContent).toContain(node.footnote);
            if (node.alsoKnownAs) expect(container.textContent).toContain(node.alsoKnownAs.name);
        }
    });

    it("opens the ancestor of a linked technique and remembers the manually selected group", async () => {
        const user = userEvent.setup();
        const first = mount("/theory/deepening/movements?group=taisabaki&node=ten+kaishin");
        const leaf = document.getElementById(studyNodeId("ten kaishin"))!;
        expect(leaf.closest("details")?.open).toBe(true);
        await user.selectOptions(screen.getByLabelText("Välj område inom Kihon"), "bōgi");
        expect(screen.getByTestId("url").textContent).not.toContain("node=");
        first.unmount();
        mount("/theory/deepening/movements");
        expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("bōgi");
    });

    it("shows source kanji for Japanese readers without translating canonical names", () => {
        render(<TranslatorContext.Provider value={new TranslatorImplementation(translations, "ja")}>
            <MemoryRouter initialEntries={["/theory/deepening/movements"]}><Routes>
                <Route path="/theory/deepening/:topic" element={<StudyTopic />} />
            </Routes></MemoryRouter>
        </TranslatorContext.Provider>);
        expect(screen.getByText("布陣法")).toBeTruthy();
        expect(screen.getByText("正体構え")).toBeTruthy();
        expect(screen.queryByText("fujinhō")).toBeNull();
    });
});

describe("Study material and search", () => {
    it("uses existing word identities, unique section anchors, and complete translations", () => {
        const keys = [...studyTopics.flatMap(topic => [topic.title, topic.description]), ...kihonIntroduction, "japanska förbundet",
            "Kihon – grunderna", "Läs mer om Kihon", "Fler uppslagsavsnitt", "Välj område inom Kihon"];
        const referenced = new Set<number>();
        for (const material of Object.values(studyMaterial)) {
            const sections = flattenStudySections(material.sections);
            expect(new Set(sections.map(section => section.key)).size).toBe(sections.length);
            for (const section of sections) {
                keys.push(section.title, ...(section.paragraphs ?? []));
                const references = [...(section.termId ? [section.termId] : []), ...(section.wordIds ?? [])];
                for (const id of references) {
                    referenced.add(id);
                    const word = studyWord(id);
                    if (!fixedOrganizationWordIds.has(id)) keys.push(...(word.meanings ?? []));
                }
            }
        }
        // The 396 terms in the original Yōgoshū dictionary import all have a
        // home in the reading subjects; adding headings must not hide one.
        expect(Array.from({ length: 396 }, (_, index) => index + 1).filter(id => !referenced.has(id))).toEqual([]);
        for (const language of Object.values(translations)) {
            const translated = new Set(Object.keys(language).map(key => key.toLowerCase()));
            for (const key of keys) expect(translated.has(key.toLowerCase()), key).toBe(true);
        }
    });

    it.each(["language", "ranks", "etiquette", "philosophy"])("fills %s from existing source entries", topic => {
        const { container } = mount(`/theory/deepening/${topic}`);
        expect(container.querySelectorAll("[data-word-id]").length).toBeGreaterThan(20);
        expect(screen.getByText(/Källa: Yōgoshū/)).toBeTruthy();
    });

    it("makes commands, monk ranks and nested Kihon branches directly findable", () => {
        const ranks = searchStudyContent("shōdōshi", translator);
        expect(ranks.get("/theory/deepening/ranks")?.path).toContain("section=sokai");
        const movements = searchStudyContent("byakuren gassho", translator);
        expect(movements.get("/theory/deepening/movements")?.path).toContain("node=gassh%C5%8D+gamae");
        expect(searchStudyContent("kamae gassho", translator).get("/theory/deepening/movements")?.path).toContain("node=gassh%C5%8D+gamae");
        expect(kihonNodePath("gasshō gamae").map(node => node.id)).toEqual(["tai gamae [kihon]", "byakuren hachi jin", "gasshō gamae"]);
        expect(searchStudyContent("hajime", translator).get("/theory/deepening/language")?.path).toContain("section=commands");
        expect(searchStudyContent("gassho taishin", translator).has("/theory/deepening/movements")).toBe(false);
    });

    it("opens the matching source section from a search link", () => {
        mount("/theory/deepening/ranks?section=sokai");
        const heading = screen.getByRole("heading", { name: "Munkgrader" });
        const section = heading.closest("details")!;
        expect(section.open).toBe(true);
        expect(within(section).getByText("shōdōshi")).toBeTruthy();
    });

    it("finds the complementary chapters on their restored page", () => {
        expect(searchStudyContent("furiko zuki", translator).get("/theory/deepening/movements")?.path).toContain("section=common-movements");
        expect(searchStudyContent("kōbō yōki", translator).get("/theory/deepening/movements")?.path).toContain("section=body-tools");
    });

    it.each([
        ["common-movements", "Vanliga rörelser och övningar", "common-movements", 319],
        ["body-tools", "Kroppens delar och redskap", "body-tools", 844],
        ["fist", "Kroppens delar och redskap", "body-tools", 459],
    ])("redirects the temporary page link for %s to the restored section", async (section, title, topic, wordId) => {
        mount(`/theory/deepening/${topic}?section=${section}`);
        expect(await screen.findByRole("heading", { level: 1, name: "Positioner och rörelser" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: title })).toBeTruthy();
        expect(screen.getByTestId("url").textContent).toContain(`/theory/deepening/movements?section=${section}`);
        expect(document.querySelector(`[data-word-id="${wordId}"]`)).toBeTruthy();
    });
});
