import kihonData from "./assets/kihon.json";
import dictionary from "./assets/word-list.json";
import type { KihonNode, WordListEntry } from "./data";
import { noTranslate, type Translator } from "./i18n";
import { searchScore } from "./activity-search";
import { studyMaterial, type StudySection } from "./study-material";
import { studyTopics, type ReadingTopicKey } from "./study-topics";

export const kihonRoots = kihonData as KihonNode[];
const wordsById = new Map((dictionary as WordListEntry[]).map(word => [word.id, word]));

export function studyWord(id: number): WordListEntry {
    const word = wordsById.get(id);
    if (!word) throw new Error(`Missing study word ${id}`);
    return word;
}

// These meanings are proper organization names, displayed verbatim like their
// dictionary entries. They are not descriptions of the organizations.
export const fixedOrganizationWordIds = new Set([74, 75]);
export function studyMeanings(word: WordListEntry, translator: Translator): string[] {
    if (word.id === 75) return [`${noTranslate("Shorinji Kempo Federation")} (${translator.translate("japanska förbundet")})`];
    return (word.meanings ?? []).map(meaning => fixedOrganizationWordIds.has(word.id) ? noTranslate(meaning) : translator.translate(meaning));
}

export function kihonNodePath(id: string, nodes = kihonRoots): KihonNode[] {
    for (const node of nodes) {
        if (node.id === id) return [node];
        const childPath = kihonNodePath(id, node.children ?? []);
        if (childPath.length) return [node, ...childPath];
    }
    return [];
}

export const studyNodeId = (id: string) => `study-node-${encodeURIComponent(id)}`;
export const studySectionId = (key: string) => `study-section-${key}`;

interface StudySearchMatch { score: number; path: string; }

// Match one coherent branch at a time. Concatenating an entire subject would
// incorrectly match words which only occur in unrelated parts of that subject.
export function searchStudyContent(query: string, translator: Translator): Map<string, StudySearchMatch> {
    const matches = new Map<string, StudySearchMatch>();
    if (!query.trim()) return matches;
    for (const topic of studyTopics) {
        if (topic.key === "groups") continue;
        let best: StudySearchMatch | undefined;
        const consider = (title: string, terms: string[], params: URLSearchParams) => {
            const score = searchScore(query, title, terms);
            if (score > 0 && (!best || score > best.score)) best = { score, path: `${topic.path}?${params}` };
        };
        const material = studyMaterial[topic.key as ReadingTopicKey];
        const titles = [topic.title, translator.translate(topic.title), translator.translate(topic.description)];
        const searchSections = (sections: StudySection[], ancestors: string[]) => {
            for (const section of sections) {
                const terms = [...ancestors, section.title, translator.translate(section.title), ...(section.paragraphs ?? []).map(text => translator.translate(text))];
                const params = new URLSearchParams({ section: section.key });
                consider(translator.translate(section.title), terms, params);
                for (const id of [...(section.termId ? [section.termId] : []), ...(section.wordIds ?? [])]) {
                    const word = studyWord(id);
                    consider(word.romaji ?? "", [...terms, word.kanji ?? "", ...studyMeanings(word, translator)], params);
                }
                searchSections(section.children ?? [], terms);
            }
        };
        searchSections(material.sections, titles);
        if (topic.key === "movements") {
            const searchNodes = (nodes: KihonNode[], ancestors: string[], rootId: string) => {
                for (const node of nodes) {
                    const terms = [...ancestors, node.name, node.kanji, ...(node.id === "taisabaki" ? ["tai sabaki"] : []),
                        ...(node.id === "fujinhō" ? [translator.translate("Inbördes positioner")] : []),
                        ...(["byakuren hachi jin", "giwa kyū jin"].includes(node.id) ? ["kamae", translator.translate("Kroppsställningar")] : []),
                        ...[node.description, node.note, node.footnote].filter((text): text is string => !!text).map(text => translator.translate(text)),
                        ...(node.alsoKnownAs ? [node.alsoKnownAs.name, node.alsoKnownAs.kanji] : [])];
                    consider(node.name, terms, new URLSearchParams({ group: rootId, node: node.id }));
                    searchNodes(node.children ?? [], terms, rootId);
                }
            };
            for (const root of kihonRoots) searchNodes([root], titles, root.id);
        }
        if (best) matches.set(topic.path, best);
    }
    return matches;
}
