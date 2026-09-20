import { Award, Book, CardHeading, Collection, HandIndex, JournalText, People, QuestionSquare, type Icon } from "react-bootstrap-icons";
import type { Translator } from "./i18n";

export interface Activity {
    path: string;
    title: string;
    section: "Träning" | "Teori";
    icon: Icon;
    languageTool?: boolean;
    variations?: string[];
}

export function activityLabel(activity: Activity, translator: Translator) {
    const title = translator.translate(activity.title);
    return activity.variations?.length ? `${title} (${activity.variations.map(term => translator.translate(term)).join(", ")})` : title;
}

// Shortcuts are additional entrances into the existing tree. Their paths are
// also the allowlist for browser history, so stale or external URLs cannot surface.
export const activities: Activity[] = [
    { path: "/kamoku/plan", title: "Veckans träning", section: "Träning", icon: Book },
    { path: "/kamoku/free/kihon", title: "Kihon", section: "Träning", icon: Book },
    { path: "/kamoku/free/hokei", title: "Hokei", section: "Träning", icon: Collection },
    { path: "/kamoku/free/tanen-sotai", title: "Tan'en och sōtai", section: "Träning", icon: Collection },
    { path: "/kamoku/free/randori", title: "Randori", section: "Träning", icon: People },
    { path: "/kamoku/free/embu", title: "Embu och kumi-embu", section: "Träning", icon: CardHeading },
    { path: "/training/grading", title: "Praktisk gradering", section: "Träning", icon: Award },
    { path: "/theory/grading", title: "Teoretisk gradering", section: "Teori", icon: Award },
    { path: "/theory/groups", title: "Teknikgrupper", section: "Teori", icon: Collection },
    { path: "/word-list", title: "Ordlista", section: "Teori", icon: JournalText, languageTool: true },
    { path: "/quiz/words", title: "Ordlistequiz", section: "Teori", icon: QuestionSquare, languageTool: true },
    { path: "/quiz/foot-stance", title: "Fotställningsquiz", section: "Teori", icon: QuestionSquare, languageTool: true },
    { path: "/quiz/hand-position", title: "Handpositionsquiz", section: "Teori", icon: HandIndex, languageTool: true },
    { path: "/flashcard/words", title: "Ordflashkort", section: "Teori", icon: CardHeading, languageTool: true },
    { path: "/flashcard/hokei", title: "Hokeiflashkort", section: "Teori", icon: CardHeading, languageTool: true },
];

export const availableActivities = (isJapanese: boolean) => activities.filter(activity => !isJapanese || !activity.languageTool);
export const activityForUrl = (url: string) => activities.find(activity => activity.path === url.split("?")[0]);

export function mainSection(path: string): string {
    if (path === "/kamoku" || path.startsWith("/kamoku/") || path.startsWith("/training/")) return "/kamoku";
    if (path === "/theory" || path.startsWith("/theory/") || /^\/(word-list|quiz|flashcard)(\/|$)/.test(path)) return "/theory";
    if (path === "/search" || path.startsWith("/technique/")) return "/search";
    return path;
}
