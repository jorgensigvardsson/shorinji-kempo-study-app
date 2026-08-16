import { useContext, useMemo, useRef, useState } from "react";
import { Badge } from "react-bootstrap";
import { Award, Book, Check2, ChevronDown, ChevronUp, Collection, ListUl, People } from "react-bootstrap-icons";
import { useSearchParams } from "react-router-dom";
import CollapsibleCard from "./components/CollapsibleCard";
import Grid, { type GridItem } from "./components/Grid";
import { noTranslate, TranslatorContext, type Translator } from "./i18n";
import { isHokeiMoment, type GradeName, type GradePlan, type HokeiMoment, type TanenKihonHokei, type Video } from "./data";
import HokeiCard from "./components/HokeiCard";
import KumiEmbuSequenceList, { type KumiEmbuTechniqueLink } from "./components/KumiEmbuSequenceList";
import VideoLink from "./components/VideoLink";
import tanenKihonHokeiData from "./assets/tanen_kihon_hokei.json";
import { findTanenMatches, tanenMatchesToVideos } from "./utilities/TanenUtils";
import { setGradingFundamentalCompletion, setGradingTheoryCompletion } from "./persistence/app-data";
import { useAppData } from "./persistence/use-app-data";

const tanenKihonHokeiMap = new Map<string, TanenKihonHokei>(
    (tanenKihonHokeiData as TanenKihonHokei[]).map(t => [t.hokei_name.trim(), t])
);
import { gradingManuals, type Item, type Numbering, type TechniqueGroup } from "./grading-exam-information";
import "./GradingTest.css";

interface GradingTestProps {
    grade: GradeName | undefined;
    allGradePlans: GradePlan[];
    subject: "theory" | "technical";
    dojoMode?: boolean;
}

const allGrades = gradingManuals;

function formatNumbering(n: Numbering | undefined): string {
    if (!n) return "";
    const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
    switch (n.style) {
        case "bullet": return "・";
        case "numeric": return `${n.value}.`;
        case "paren": return `(${n.value})`;
        case "circled": {
            const v = n.value;
            return v && v >= 1 && v <= 10 ? circled[v - 1] : `(${v})`;
        }
    }
}

interface ItemDisplay {
    primary: string;
    romajiSecondary?: string;
    kanji?: string;
    gloss?: string;
}

// Subject/category labels are app-level presentation names (not part of the extracted
// kamokuhyō data), mapping a Japanese term's romaji to a title in the user's language.
// Anything not listed here is a specific technique/hōkei name and keeps its romaji as title.
const categoryTitles: Record<string, string> = {
    "kiso kamoku": "Grunder",
    "chūshutsu kamoku": "Utvalda tekniker",
    "kumi embu": "Kumi-embu",
    "un'yōhō": "Tillämpning",
    "gōhō un'yōhō": "Tillämpning hårda tekniker",
    "jūhō un'yōhō": "Tillämpning mjuka tekniker",
    "gijutsu I": "Teknik I",
    "gijutsu II": "Teknik II",
    "hōkei kamoku": "Teknikämnen",
    "tai gamae, tai sabaki": "Kroppsställning och kroppsföring",
    "tai gamae, tai sabaki, umpohō": "Kroppsställning, kroppsföring och fotförflyttning",
    "tai gamae": "Kroppsställning",
    "tai gamae, fujinhō": "Kroppsställning och fujinhō",
    "umpohō": "Fotförflyttning",
    "ukemi": "Fallteknik",
    "kihon kōgi": "Grundläggande angrepp",
    "kihon kōgi 1": "Grundläggande angrepp 1",
    "kihon kōgi 2": "Grundläggande angrepp 2",
    "kihon bōgi": "Grundläggande försvar",
    "idō kōgi": "Anfall i rörelse",
    "idō kōbōgi": "Anfall och försvar i rörelse",
    "idō kōbōgi (sōtai)": "Anfall och försvar i rörelse (parvis)",
    "tan'en kihon hōkei": "Grundläggande hōkei (enskild)",
    "tan'en kihon hōkei (sōtai)": "Grundläggande hōkei (parvis)",
    "kenkei betsu shitei kamoku": "Utvalda tekniker från kenkei",
    "rei shiki, sahō": "Etikett och uppförande",
};

function itemDisplay(item: Item, translator: Translator, showKanji: boolean): ItemDisplay {
    const romaji = item.term?.romaji?.trim();
    const kanji = romaji ? translator.japanese(romaji) : undefined;
    const kanjiDisplay = kanji !== romaji ? kanji : undefined;
    const shownKanji = !translator.isJapanese && showKanji ? kanjiDisplay : undefined;
    const gloss = item.term?.gloss ? translator.translate(item.term.gloss) : undefined;

    // Title is always in the user's language: an explicit Swedish `text`, or a category
    // label looked up from the romaji term. Technique names have neither, so romaji is the title.
    const titleSource = item.text ?? (romaji ? categoryTitles[romaji] : undefined);
    if (titleSource) {
        return {
            primary: translator.translate(titleSource),
            romajiSecondary: translator.isJapanese ? undefined : romaji,
            kanji: shownKanji,
            // A category label's gloss merely restates the title, so drop it there.
            gloss: item.text ? gloss : undefined,
        };
    }
    if (translator.isJapanese && kanjiDisplay) {
        return { primary: kanjiDisplay, gloss };
    }
    return {
        primary: romaji ?? "",
        kanji: shownKanji,
        gloss,
    };
}

const sentenceCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function hasExpandableContent(item: Item): boolean {
    return !!(
        item.description
        || item.term?.gloss
        || item.annotations?.length
        || item.techniqueGroups?.length
        || item.items?.length
        || item.videos?.length
    );
}

function itemSummary(item: Item, translator: Translator, showKanji: boolean) {
    const display = itemDisplay(item, translator, showKanji);
    const subtitleParts = [display.romajiSecondary, display.kanji].filter((value): value is string => !!value);
    return {
        display,
        title: sentenceCase(display.primary),
        subtitle: subtitleParts.length > 0 ? sentenceCase(subtitleParts.join(" · ")) : undefined,
    };
}

function categoryIcon(romaji: string | undefined) {
    switch (romaji) {
        case "kiso kamoku":
        case "gijutsu I":
            return <Book />;
        case "chūshutsu kamoku":
        case "gijutsu II":
            return <Collection />;
        case "kumi embu":
            return <People />;
        case "hōkei kamoku":
            return <ListUl />;
        default:
            return <Award />;
    }
}

interface FundamentalGroupDefinition {
    title: string;
    translateTitle: boolean;
    terms: Set<string>;
}

const fundamentalGroupDefinitions: FundamentalGroupDefinition[] = [
    {
        title: "Rörelse och säkerhet",
        translateTitle: true,
        terms: new Set([
            "tai gamae, tai sabaki",
            "tai gamae, tai sabaki, umpohō",
            "tai gamae",
            "tai gamae, fujinhō",
            "umpohō",
            "ukemi",
            "rei shiki, sahō",
        ]),
    },
    {
        title: "Angrepp och försvar",
        translateTitle: true,
        terms: new Set([
            "kihon kōgi",
            "kihon kōgi 1",
            "kihon kōgi 2",
            "kihon bōgi",
            "idō kōgi",
            "idō kōbōgi",
            "idō kōbōgi (sōtai)",
        ]),
    },
    {
        title: noTranslate("Hōkei"),
        translateTitle: false,
        terms: new Set([
            "tan'en kihon hōkei",
            "tan'en kihon hōkei (sōtai)",
        ]),
    },
    {
        title: "Teknikurval",
        translateTitle: true,
        terms: new Set(["kenkei betsu shitei kamoku"]),
    },
];

interface FundamentalItemGroup extends FundamentalGroupDefinition {
    items: Array<{ item: Item; itemIndex: number }>;
}

function groupFundamentalItems(items: Item[]): FundamentalItemGroup[] {
    const groups = fundamentalGroupDefinitions.map(definition => ({ ...definition, items: [] as Array<{ item: Item; itemIndex: number }> }));
    const other: FundamentalItemGroup = {
        title: "Övrigt",
        translateTitle: true,
        terms: new Set(),
        items: [],
    };

    items.forEach((item, itemIndex) => {
        const romaji = item.term?.romaji;
        const group = groups.find(candidate => romaji && candidate.terms.has(romaji)) ?? other;
        group.items.push({ item, itemIndex });
    });

    return [...groups, other].filter(group => group.items.length > 0);
}

const structuredTechniqueGroupLabels: Record<string, string[]> = {
    "tai gamae, tai sabaki": ["Kroppsställningar", "Kroppsföring"],
    "tai gamae, tai sabaki, umpohō": ["Kroppsställningar", "Kroppsföring", "Fotförflyttning"],
};

function structuredTechniqueGroupLabel(parentTerm: string | undefined, groupIndex: number, groupCount: number): string | undefined {
    if (!parentTerm || groupCount <= 1) return undefined;
    return structuredTechniqueGroupLabels[parentTerm]?.[groupIndex];
}

function gradingFundamentalCompletionKey(grade: GradeName, item: Item, itemIndex: number): string {
    return `${grade}|${item.term?.romaji ?? `item-${itemIndex}`}`;
}

function gradingTheoryCompletionKey(grade: GradeName, item: Item, itemIndex: number): string {
    return `${grade}|${item.term?.romaji ?? `item-${itemIndex}`}`;
}

const GradingCompletionProgress = ({ completed, total, translator }: { completed: number; total: number; translator: Translator }) => (
    <span
        className={`grading-completion-progress${completed === total && total > 0 ? " is-complete" : ""}`}
        aria-label={translator.translate("{0} av {1} delar klarmarkerade", {
            params: [String(completed), String(total)],
        })}
    >
        <span aria-hidden="true">{completed}/{total}</span>
        <Check2 aria-hidden="true" />
    </span>
);

const GradingTest = ({ grade, allGradePlans, subject, dojoMode = false }: GradingTestProps) => {
    const translator = useContext(TranslatorContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const showKanji = !dojoMode;
    const gradingFundamentalCompletions = useAppData("gradingFundamentalCompletions");
    const gradingTheoryCompletions = useAppData("gradingTheoryCompletions");
    const selectedGrade = grade && allGrades[grade] !== undefined ? grade : undefined;
    const [selection, setSelection] = useState<{ grade: GradeName; sectionIndex: number; itemIndex: number } | null>(null);
    const [expandedFundamental, setExpandedFundamental] = useState<string | null>(null);
    const categoryParam = searchParams.get("gradingCategory");
    const [categoryGrade, categorySection, categoryItem] = categoryParam?.split("|") ?? [];
    const categorySelection = selectedGrade
        && categoryGrade === selectedGrade
        && /^\d+$/.test(categorySection ?? "")
        && /^\d+$/.test(categoryItem ?? "")
        ? { grade: selectedGrade, sectionIndex: Number(categorySection), itemIndex: Number(categoryItem) }
        : null;
    const activeSelection = subject === "technical"
        ? categorySelection
        : selection?.grade === selectedGrade ? selection : null;

    const hokeiMap = useMemo(() => {
        const map = new Map<string, HokeiMoment>();
        const plan = allGradePlans.find(p => p.grade === selectedGrade);
        if (!plan) return map;
        for (const week of plan.weeks)
            if ("moments" in week)
                for (const m of week.moments.filter(isHokeiMoment))
                    map.set(m.hokei_name, m);
        return map;
    }, [allGradePlans, selectedGrade]);

    const manual = selectedGrade ? allGrades[selectedGrade] : undefined;
    if (!manual) {
        return (
            <div className="grading-test-page">
                <p className="text-muted mb-0">{translator.translate("Information för graderingstest saknas.")}</p>
            </div>
        );
    }

    const subjectTerm = subject === "theory" ? "gakka kamoku" : "gijutsu kamoku";
    const sections = manual.sections
        .map((section, sectionIndex) => ({ section, sectionIndex }))
        .filter(({ section }) => section.term?.romaji === subjectTerm);

    const selectedSection = activeSelection ? manual.sections[activeSelection.sectionIndex] : undefined;
    const selectedItem = selectedSection && activeSelection
        ? selectedSection.items[activeSelection.itemIndex]
        : undefined;

    const openTechnicalCategory = (sectionIndex: number, itemIndex: number) => {
        if (!selectedGrade) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("gradingCategory", `${selectedGrade}|${sectionIndex}|${itemIndex}`);
        setSearchParams(nextParams);
    };

    if (subject === "technical" && activeSelection && selectedSection && selectedItem) {
        const { display, title, subtitle } = itemSummary(selectedItem, translator, showKanji);
        const isFundamentals = selectedItem.term?.romaji === "kiso kamoku";
        const isKumiEmbu = selectedItem.term?.romaji === "kumi embu";
        const fundamentalItems = selectedItem.items ?? [];
        const completedFundamentalCount = isFundamentals
            ? fundamentalItems.filter((fundamentalItem, fundamentalIndex) =>
                gradingFundamentalCompletions[gradingFundamentalCompletionKey(activeSelection.grade, fundamentalItem, fundamentalIndex)]
              ).length
            : 0;
        return (
            <div className={`grading-test-page grading-category-page grading-detail-enter${dojoMode ? " is-dojo-mode" : ""}`}>
                <header className="grading-category-header">
                    <div className="grading-category-heading">
                        <div className="text-muted small mb-1">{sentenceCase(translator.translate(selectedSection.title))}</div>
                        <div className="grading-category-title-line">
                            <h2 className="app-view-heading">{title}</h2>
                            {isFundamentals && (
                                <GradingCompletionProgress
                                    completed={completedFundamentalCount}
                                    total={fundamentalItems.length}
                                    translator={translator}
                                />
                            )}
                        </div>
                        {!isKumiEmbu && subtitle && <div className="text-muted small mt-1">{subtitle}</div>}
                        {display.gloss && <div className="text-muted small mt-1">({display.gloss})</div>}
                        {isFundamentals && selectedItem.points != null && (
                            <div className="grading-category-summary mt-2">
                                <span>{selectedItem.points}{translator.translate("p")}</span>
                            </div>
                        )}
                    </div>
                    {!isFundamentals && selectedItem.points != null && <Badge bg="secondary">{selectedItem.points}{translator.translate("p")}</Badge>}
                </header>

                {isFundamentals ? (
                    <FundamentalsDetail
                        item={selectedItem}
                        grade={activeSelection.grade}
                        translator={translator}
                        showKanji={showKanji}
                        completions={gradingFundamentalCompletions}
                        expandedKey={expandedFundamental}
                        onExpandedChange={setExpandedFundamental}
                    />
                ) : isKumiEmbu ? (
                    <KumiEmbuDetail
                        item={selectedItem}
                        grade={activeSelection.grade}
                        hokeiMap={hokeiMap}
                        dojoMode={dojoMode}
                    />
                ) : (
                    <ItemDetail
                        item={selectedItem}
                        translator={translator}
                        showKanji={showKanji}
                        hokeiMap={hokeiMap}
                        dojoMode={dojoMode}
                        showGloss={false}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={`grading-test-page${dojoMode ? " is-dojo-mode" : ""}`}>
            <header className="grading-page-header">
                <h2 className="app-view-heading">{translator.translate(manual.title)}</h2>
                {manual.term && !translator.isJapanese && <div className="text-muted small mt-1">{sentenceCase(manual.term.romaji)}</div>}
            </header>

            <div className="grading-sections">
                {sections.map(({ section, sectionIndex }) => {
                    const completedTheoryItemCount = subject === "theory" && selectedGrade
                        ? section.items.filter((item, itemIndex) =>
                            gradingTheoryCompletions[gradingTheoryCompletionKey(selectedGrade, item, itemIndex)]
                          ).length
                        : 0;
                    const categoryItems: GridItem[] = section.items.map((item, itemIndex) => {
                        const summary = itemSummary(item, translator, showKanji);
                        return {
                            key: `category-${sectionIndex}-${itemIndex}`,
                            title: summary.title,
                            subtitle: summary.subtitle,
                            badge: item.points != null ? <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge> : undefined,
                            icon: categoryIcon(item.term?.romaji),
                            onSelect: selectedGrade
                                ? () => openTechnicalCategory(sectionIndex, itemIndex)
                                : undefined,
                        };
                    });

                    return (
                        <section className="grading-section" key={`section-${sectionIndex}`}>
                            <header className="grading-section-heading">
                                <div className="grading-section-title-line">
                                    <h3 className="app-section-heading">{sentenceCase(translator.translate(section.title))}</h3>
                                    {subject === "theory" && (
                                        <GradingCompletionProgress
                                            completed={completedTheoryItemCount}
                                            total={section.items.length}
                                            translator={translator}
                                        />
                                    )}
                                </div>
                                {!translator.isJapanese && section.term?.romaji && (
                                    <div className="text-muted small mt-1">{sentenceCase(section.term.romaji)}</div>
                                )}
                            </header>

                            {subject === "technical" ? (
                                <Grid items={categoryItems} className="start-grid" />
                            ) : (
                                <div className="grading-outline">
                                    {section.items.map((item, itemIndex) => {
                                        const { title, subtitle } = itemSummary(item, translator, showKanji);
                                        const expandable = hasExpandableContent(item);
                                        const expanded = activeSelection?.sectionIndex === sectionIndex
                                            && activeSelection.itemIndex === itemIndex;
                                        const detailsId = `grading-item-${subject}-${sectionIndex}-${itemIndex}`;
                                        const completionKey = selectedGrade
                                            ? gradingTheoryCompletionKey(selectedGrade, item, itemIndex)
                                            : undefined;
                                        const completed = completionKey ? !!gradingTheoryCompletions[completionKey] : false;
                                        const rowContent = (
                                            <>
                                                <span className="grading-outline-copy">
                                                    <span className="grading-outline-title">{title}</span>
                                                    {subtitle && <span className="grading-outline-subtitle">{subtitle}</span>}
                                                </span>
                                                <span className="grading-outline-meta">
                                                    {item.points != null && <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge>}
                                                    {expandable && (expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />)}
                                                </span>
                                            </>
                                        );

                                        return (
                                            <article className={`grading-outline-item${expanded ? " is-expanded" : ""}${completed ? " is-complete" : ""}`} key={`item-${sectionIndex}-${itemIndex}`}>
                                                <div className="grading-outline-row">
                                                    {completionKey && (
                                                        <label className="grading-completion-control">
                                                            <input
                                                                type="checkbox"
                                                                className="grading-completion-input"
                                                                checked={completed}
                                                                aria-label={translator.translate(completed ? "Ta bort klarmarkering för {0}" : "Klarmarkera {0}", {
                                                                    params: [title],
                                                                })}
                                                                onChange={event => setGradingTheoryCompletion(completionKey, event.currentTarget.checked)}
                                                            />
                                                            <span className="grading-completion-circle" aria-hidden="true">
                                                                {completed && <Check2 />}
                                                            </span>
                                                        </label>
                                                    )}
                                                    {expandable && selectedGrade ? (
                                                        <button
                                                            type="button"
                                                            className="grading-outline-trigger"
                                                            aria-expanded={expanded}
                                                            aria-controls={detailsId}
                                                            onClick={() => setSelection(expanded ? null : { grade: selectedGrade, sectionIndex, itemIndex })}
                                                        >
                                                            {rowContent}
                                                        </button>
                                                    ) : (
                                                        <div className="grading-outline-summary">{rowContent}</div>
                                                    )}
                                                </div>

                                                {expanded && (
                                                    <div id={detailsId} className="grading-outline-detail grading-detail-enter">
                                                        <ItemDetail
                                                            item={item}
                                                            translator={translator}
                                                            showKanji={showKanji}
                                                            hokeiMap={hokeiMap}
                                                            dojoMode={dojoMode}
                                                        />
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

const KumiEmbuDetail = ({ item, grade, hokeiMap, dojoMode }: {
    item: Item;
    grade: GradeName;
    hokeiMap: Map<string, HokeiMoment>;
    dojoMode: boolean;
}) => {
    const translator = useContext(TranslatorContext);
    const [preview, setPreview] = useState<{ hokei: HokeiMoment; requestId: number } | null>(null);
    const previewRequestId = useRef(0);
    const techniques: KumiEmbuTechniqueLink[] = [...hokeiMap.entries()].map(([key, hokei]) => ({
        key,
        hokei,
        onSelect: () => {
            previewRequestId.current += 1;
            setPreview({ hokei, requestId: previewRequestId.current });
        },
    }));

    return (
        <div className="grading-kumi-embu">
            {item.description && <p>{translator.translate(item.description)}</p>}
            {item.annotations?.map((annotation, annotationIndex) => (
                <p key={annotationIndex} className="grading-kumi-note">
                    {translator.translate(annotation.text)}
                </p>
            ))}
            <KumiEmbuSequenceList
                items={item.items ?? []}
                techniques={techniques}
                dojoMode={dojoMode}
            />
            {item.videos && item.videos.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-3">
                    {item.videos.map(video => <VideoLink key={video.url} video={video} />)}
                </div>
            )}
            {preview && (
                <div className="grading-kumi-preview">
                    <HokeiCard
                        key={`${preview.hokei.hokei_name}-${preview.requestId}`}
                        hokei={preview.hokei}
                        gradeName={grade}
                        showNotes
                        showRating
                        dojoMode={dojoMode}
                        kamokuLayout
                        defaultOpen
                        onOpenChange={open => {
                            if (!open) setPreview(null);
                        }}
                    />
                </div>
            )}
        </div>
    );
};


const ItemDetail = ({ item, translator, showKanji, hokeiMap, dojoMode, showGloss = true }: { item: Item; translator: Translator; showKanji: boolean; hokeiMap: Map<string, HokeiMoment>; dojoMode: boolean; showGloss?: boolean }) => {
    const display = itemDisplay(item, translator, showKanji);

    return (
        <div>
            {showGloss && display.gloss && <div className="text-muted small mb-2">({display.gloss})</div>}
            {item.description && <p className="mb-2">{translator.translate(item.description)}</p>}
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {translator.translate(ann.text)}</p>
            ))}
            <TechniqueGroups groups={item.techniqueGroups} translator={translator} showKanji={showKanji} />
            <div className="d-flex flex-column gap-2">
                {item.items?.map((subItem, i) => (
                    <SubItemCard key={i} item={subItem} translator={translator} showKanji={showKanji} showEmojiNumbers={item.term?.romaji === "kumi embu"} showHokeiCards={item.term?.romaji === "kumi embu" || item.term?.romaji === "hōkei kamoku"} hokeiMap={hokeiMap} dojoMode={dojoMode} />
                ))}
            </div>
            {item.videos && item.videos.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-2">
                    {item.videos.map(video => (
                        <VideoLink key={video.url} video={video} />
                    ))}
                </div>
            )}
        </div>
    );
};

interface FundamentalsDetailProps {
    item: Item;
    grade: GradeName;
    translator: Translator;
    showKanji: boolean;
    completions: Record<string, { completedAt: string }>;
    expandedKey: string | null;
    onExpandedChange: (key: string | null) => void;
}

const FundamentalsDetail = ({ item, grade, translator, showKanji, completions, expandedKey, onExpandedChange }: FundamentalsDetailProps) => {
    const groups = groupFundamentalItems(item.items ?? []);

    return (
        <div className="grading-fundamentals">
            {item.description && <p className="mb-3">{translator.translate(item.description)}</p>}
            {item.annotations?.map((annotation, annotationIndex) => (
                <p key={annotationIndex} className="grading-fundamental-note">* {translator.translate(annotation.text)}</p>
            ))}

            {groups.map((group, groupIndex) => (
                <section className="grading-fundamental-group" key={group.title}>
                    <h3 className="app-eyebrow-heading">{group.translateTitle ? translator.translate(group.title) : group.title}</h3>
                    <div className="grading-fundamental-list">
                        {group.items.map(({ item: fundamentalItem, itemIndex }) => {
                            const { title, subtitle } = itemSummary(fundamentalItem, translator, showKanji);
                            const rowKey = `${groupIndex}-${itemIndex}`;
                            const detailsId = `grading-fundamental-${groupIndex}-${itemIndex}`;
                            const expanded = expandedKey === rowKey;
                            const expandable = hasFundamentalDetails(fundamentalItem);
                            const completionKey = gradingFundamentalCompletionKey(grade, fundamentalItem, itemIndex);
                            const completed = !!completions[completionKey];
                            const rowContent = (
                                <>
                                    <span className="grading-fundamental-copy">
                                        <span className="grading-fundamental-title">{title}</span>
                                        {subtitle && <span className="grading-fundamental-subtitle">{subtitle}</span>}
                                    </span>
                                    <span className="grading-fundamental-meta">
                                        {fundamentalItem.points != null && <span>{fundamentalItem.points}{translator.translate("p")}</span>}
                                        {expandable && (expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />)}
                                    </span>
                                </>
                            );

                            return (
                                <article className={`grading-fundamental-item${expanded ? " is-expanded" : ""}${completed ? " is-complete" : ""}`} key={rowKey}>
                                    <div className="grading-fundamental-row">
                                        <label className="grading-completion-control">
                                            <input
                                                type="checkbox"
                                                className="grading-completion-input"
                                                checked={completed}
                                                aria-label={translator.translate(completed ? "Ta bort klarmarkering för {0}" : "Klarmarkera {0}", {
                                                    params: [title],
                                                })}
                                                onChange={event => setGradingFundamentalCompletion(completionKey, event.currentTarget.checked)}
                                            />
                                            <span className="grading-completion-circle" aria-hidden="true">
                                                {completed && <Check2 />}
                                            </span>
                                        </label>
                                        {expandable ? (
                                            <button
                                                type="button"
                                                className="grading-fundamental-trigger"
                                                aria-expanded={expanded}
                                                aria-controls={detailsId}
                                                onClick={() => onExpandedChange(expanded ? null : rowKey)}
                                            >
                                                {rowContent}
                                            </button>
                                        ) : (
                                            <div className="grading-fundamental-summary">{rowContent}</div>
                                        )}
                                    </div>

                                    {expanded && (
                                        <div id={detailsId} className="grading-fundamental-detail grading-detail-enter">
                                            <FundamentalItemContent
                                                item={fundamentalItem}
                                                translator={translator}
                                                showKanji={showKanji}
                                            />
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}

            {item.videos && item.videos.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-3">
                    {item.videos.map(video => <VideoLink key={video.url} video={video} />)}
                </div>
            )}
        </div>
    );
};

function tanenVideosForItem(item: Item): Video[] {
    const romaji = item.term?.romaji?.trim() ?? "";
    return romaji.startsWith("tan'en kihon")
        ? tanenMatchesToVideos(
            (item.techniqueGroups ?? [])
                .flatMap(group => group.techniques)
                .flatMap(technique => findTanenMatches(
                    technique.romaji,
                    tanenKihonHokeiMap,
                    romaji.includes("sōtai") ? "sōtai" : "tan'en",
                )),
          )
        : tanenMatchesToVideos(
            tanenKihonHokeiMap.has(romaji) ? [tanenKihonHokeiMap.get(romaji)!] : [],
          );
}

function hasFundamentalDetails(item: Item): boolean {
    return hasExpandableContent(item) || tanenVideosForItem(item).length > 0;
}

const FundamentalItemContent = ({ item, translator, showKanji }: { item: Item; translator: Translator; showKanji: boolean }) => {
    const tanenVideos = tanenVideosForItem(item);

    return (
        <div>
            {item.description && <p className="mb-3">{translator.translate(item.description)}</p>}
            {item.annotations?.map((annotation, annotationIndex) => (
                <p key={annotationIndex} className="grading-fundamental-note">* {translator.translate(annotation.text)}</p>
            ))}
            <TechniqueGroups
                groups={item.techniqueGroups}
                translator={translator}
                showKanji={showKanji}
                parentTerm={item.term?.romaji}
                structured
            />
            {item.items && item.items.length > 0 && (
                <div className="grading-fundamental-subitems">
                    {item.items.map((subItem, subItemIndex) => {
                        const display = itemDisplay(subItem, translator, showKanji);
                        return (
                            <div className="grading-fundamental-subitem" key={subItemIndex}>
                                {formatNumbering(subItem.numbering) && (
                                    <span className="grading-fundamental-subitem-number">{formatNumbering(subItem.numbering)}</span>
                                )}
                                <span>
                                    {sentenceCase(display.primary)}
                                    {display.romajiSecondary && <span className="text-muted small ms-1 fst-italic">— {display.romajiSecondary}</span>}
                                    {display.kanji && <span className="text-muted small ms-1">— {display.kanji}</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            {tanenVideos.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-3">
                    {tanenVideos.map(video => <VideoLink key={video.url} video={video} />)}
                </div>
            )}
            {item.videos && item.videos.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-3">
                    {item.videos.map(video => <VideoLink key={video.url} video={video} />)}
                </div>
            )}
        </div>
    );
};

const emojiNumbers = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function extractHokeis(romaji: string, hokeiMap: Map<string, HokeiMoment>): HokeiMoment[] {
    return romaji.replace(/\s*\(.*$/, '').trim()
        .split(/\s*&\s*/)
        .map(p => p.split(/\s+-\s+/)[0].trim())
        .map(p => hokeiMap.get(p))
        .filter((h): h is HokeiMoment => !!h);
}

const SubItemCard = ({ item, translator, showKanji, showEmojiNumbers, showHokeiCards, hokeiMap, dojoMode }: { item: Item; translator: Translator; showKanji: boolean; showEmojiNumbers?: boolean; showHokeiCards?: boolean; hokeiMap?: Map<string, HokeiMoment>; dojoMode: boolean }) => {
    const display = itemDisplay(item, translator, showKanji);
    const hokeis = showHokeiCards && hokeiMap && item.term?.romaji
        ? extractHokeis(item.term.romaji, hokeiMap)
        : [];
    const tanenVideos = tanenVideosForItem(item);
    const hasContent = hasExpandableContent(item) || hokeis.length > 0 || tanenVideos.length > 0;
    const numEmoji = showEmojiNumbers && item.numbering?.style === "paren" && item.numbering.value != null
        ? (emojiNumbers[item.numbering.value] ?? `(${item.numbering.value})`)
        : undefined;

    const header = (
        <div className="d-flex justify-content-between align-items-start w-100">
            <div>
                {numEmoji && <span className="me-2">{numEmoji}</span>}
                <span className="fw-semibold">{sentenceCase(display.primary)}</span>
                {display.gloss && <span className="text-muted ms-1 small">({display.gloss})</span>}
                {display.romajiSecondary && <div className="text-muted small fst-italic">{display.romajiSecondary}</div>}
                {display.kanji && <div className="text-muted small">{display.kanji}</div>}
            </div>
            {item.points != null && <Badge bg="secondary" className="ms-2 flex-shrink-0">{item.points}{translator.translate("p")}</Badge>}
        </div>
    );

    return (
        <CollapsibleCard
            className="hokei-card"
            header={header}
            showCollapse={hasContent}
            inlineChevron
        >
            {item.description && <p className="mb-2">{translator.translate(item.description)}</p>}
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {translator.translate(ann.text)}</p>
            ))}
            {hokeis.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-2">
                    {hokeis.map(h => (
                        <HokeiCard key={h.hokei_name} hokei={h} compact showNotes showRating dojoMode={dojoMode} />
                    ))}
                </div>
            )}
            <TechniqueGroups groups={item.techniqueGroups} translator={translator} showKanji={showKanji} />
            {tanenVideos.length > 0 && (
                <div className="mt-3 d-flex flex-column gap-2">
                    {tanenVideos.map(v => (
                        <VideoLink key={v.url} video={v} />
                    ))}
                </div>
            )}
            {item.videos && item.videos.length > 0 && (
                <div className="mt-3 d-flex flex-column gap-2">
                    {item.videos.map(video => (
                        <VideoLink key={video.url} video={video} />
                    ))}
                </div>
            )}
            {item.items?.map((subItem, i) => {
                const subDisplay = itemDisplay(subItem, translator, showKanji);
                const subPrefix = formatNumbering(subItem.numbering);
                return (
                    <div key={i} className="ms-2 mb-1">
                        {subPrefix && <span className="text-muted me-1 small">{subPrefix}</span>}
                        <span>{subDisplay.primary}</span>
                        {subDisplay.romajiSecondary && <span className="text-muted small ms-1 fst-italic">— {subDisplay.romajiSecondary}</span>}
                        {subDisplay.kanji && <span className="text-muted small ms-1">— {subDisplay.kanji}</span>}
                    </div>
                );
            })}
        </CollapsibleCard>
    );
};

const TechniqueGroups = ({ groups, translator, showKanji, parentTerm, structured = false }: { groups: TechniqueGroup[] | undefined; translator: Translator; showKanji: boolean; parentTerm?: string; structured?: boolean }) => (
    <>
        {groups?.map((group, groupIndex) => (
            <div key={groupIndex} className={structured ? "grading-technique-group" : "mb-2"}>
                {(group.context?.text || structuredTechniqueGroupLabel(parentTerm, groupIndex, groups.length)) && (
                    <div className={structured ? "grading-technique-group-title" : "text-muted small mb-1"}>
                        {translator.translate(group.context?.text ?? structuredTechniqueGroupLabel(parentTerm, groupIndex, groups.length)!)}
                    </div>
                )}
                <ul className={structured ? "grading-technique-list" : "mb-0"}>
                    {group.techniques.map((tech, techniqueIndex) => {
                        const techKanji = translator.japanese(tech.romaji);
                        const hasKanji = techKanji !== tech.romaji;
                        return (
                            <li key={techniqueIndex}>
                                {translator.isJapanese && hasKanji ? techKanji : tech.romaji}
                                {!translator.isJapanese && showKanji && hasKanji && <span className="text-muted ms-1 small">{techKanji}</span>}
                            </li>
                        );
                    })}
                </ul>
            </div>
        ))}
    </>
);

export default GradingTest;
