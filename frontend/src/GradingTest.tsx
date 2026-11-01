import { useContext, useMemo, useState } from "react";
import { Badge } from "react-bootstrap";
import { Check2 } from "react-bootstrap-icons";
import { useSearchParams } from "react-router-dom";
import CollapsibleCard from "./components/CollapsibleCard";
import { noTranslate, TranslatorContext, type Translator } from "./i18n";
import { getAllHokeiMoments, isHokeiMoment, type GradeName, type GradePlan, type HokeiMoment, type TanenKihonHokei, type Video } from "./data";
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
import TrainingPageControls from "./components/TrainingPageControls";
import CompletionMark from "./components/CompletionMark";
import DisclosureChevron from "./components/DisclosureChevron";

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
    "kumi embu": "Graderings-kumi embu",
    "un'yōhō": "Tillämpning",
    "gōhō un'yōhō": "Tillämpning hårda tekniker",
    "jūhō un'yōhō": "Tillämpning mjuka tekniker",
    "gijutsu I": "Teknik I",
    "gijutsu II": "Teknik II",
    "hōkei kamoku": "Teknikämnen",
    "tai gamae, tai sabaki": "Kroppsställning och vändningar",
    "tai gamae, tai sabaki, umpohō": "Kroppsställning, vändningar och fotförflyttning",
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
    "tai gamae, tai sabaki": ["Kroppsställningar", "Vändningar"],
    "tai gamae, tai sabaki, umpohō": ["Kroppsställningar", "Vändningar", "Fotförflyttning"],
};

const turningNames = new Set(["zen tenkan", "han tenkan"]);
const completeFootworkOrder = [
    "chidori ashi",
    "ushiro chidori ashi",
    "jun sagari",
    "hiraki sagari",
    "mae chidori ashi",
    "sashikomi ashi",
    "sashikae ashi",
    "kani ashi",
    "kumo ashi",
    "jūji ashi",
];

// The grading source deliberately stays verbatim. This presentation-only view
// separates turns from footwork and supplements the umbrella term chidori ashi
// with the named forward/backward movements used in training.
function fundamentalTechniqueGroupsForDisplay(parentTerm: string | undefined, groups: TechniqueGroup[] | undefined): TechniqueGroup[] | undefined {
    if (parentTerm !== "tai gamae, tai sabaki, umpohō" || groups?.length !== 3) return groups;

    const [stances, movement, sourceFootwork] = groups;
    const turns = movement.techniques.filter(technique => turningNames.has(technique.romaji));
    const footworkTerms = [
        ...movement.techniques.filter(technique => !turningNames.has(technique.romaji)),
        ...sourceFootwork.techniques,
        ...completeFootworkOrder.map(romaji => ({ romaji })),
    ];
    const termsByName = new Map(footworkTerms.map(term => [term.romaji, term]));
    const orderedFootwork = [
        ...completeFootworkOrder.flatMap(name => termsByName.get(name) ?? []),
        ...footworkTerms.filter(term => !completeFootworkOrder.includes(term.romaji)),
    ];

    return [
        stances,
        { ...movement, techniques: turns },
        { ...sourceFootwork, techniques: orderedFootwork },
    ];
}

function structuredTechniqueGroupLabel(parentTerm: string | undefined, groupIndex: number, groupCount: number): string | undefined {
    if (!parentTerm || groupCount <= 1) return undefined;
    return structuredTechniqueGroupLabels[parentTerm]?.[groupIndex];
}

// Where a ticked item is stored. Built from the item's id rather than from how it
// reads, so correcting a romaji leaves everyone's saved progress where it is — and
// from the id rather than its position, so reordering the material does not hand one
// item's ticks to another. Fundamental and theory completions live in separate maps,
// which is what keeps their identical keys apart.
//
// An item with no id is one nothing is stored against, so it gets no key and no
// checkbox. Returning undefined rather than falling back keeps a missing id from
// quietly becoming a key that several items would share.
function gradingCompletionKey(grade: GradeName, item: Item): string | undefined {
    return item.id ? `${grade}|${item.id}` : undefined;
}

const GradingCompletionProgress = ({ completed, total, translator }: { completed: number; total: number; translator: Translator }) => (
    <span
        className={`grading-completion-progress${completed === total && total > 0 ? " is-complete" : ""}`}
        aria-label={translator.translate("{0} av {1} delar klarmarkerade", {
            params: [String(completed), String(total)],
        })}
    >
        <span aria-hidden="true">{completed}/{total}</span>
        {completed === total && total > 0 && <Check2 aria-hidden="true" />}
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
    const kumiEmbuTechniques = useMemo<KumiEmbuTechniqueLink[]>(() => allGradePlans.flatMap(plan =>
        getAllHokeiMoments(plan).map((hokei, index) => ({
            key: `${plan.grade}|${hokei.id}|${index}`,
            hokei,
            grade: plan.grade,
        }))
    ), [allGradePlans]);

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

    const toggleTechnicalCategory = (sectionIndex: number, itemIndex: number) => {
        if (!selectedGrade) return;
        const nextParams = new URLSearchParams(searchParams);
        const alreadyExpanded = activeSelection?.sectionIndex === sectionIndex
            && activeSelection.itemIndex === itemIndex;
        if (alreadyExpanded) nextParams.delete("gradingCategory");
        else nextParams.set("gradingCategory", `${selectedGrade}|${sectionIndex}|${itemIndex}`);
        // An open category is part of this page, not another navigation step. Replacing
        // the URL keeps old direct links useful without making Back close an accordion.
        setSearchParams(nextParams, { replace: true });
    };

    return (
        <div className={`grading-test-page${dojoMode ? " is-dojo-mode" : ""}`}>
            <header className="grading-page-header">
                <h2 className="app-view-heading">{translator.translate(manual.title)}</h2>
                <TrainingPageControls showGrade showDojo className="grading-page-controls" />
                {manual.term && !translator.isJapanese && <div className="text-muted small mt-1">{sentenceCase(manual.term.romaji)}</div>}
            </header>

            <div className="grading-sections">
                {sections.map(({ section, sectionIndex }) => {
                    const completedTheoryItemCount = subject === "theory" && selectedGrade
                        ? section.items.filter(item => {
                            const key = gradingCompletionKey(selectedGrade, item);
                            return key && gradingTheoryCompletions[key];
                          }).length
                        : 0;
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
                                <div className="grading-outline grading-technical-outline">
                                    {section.items.map((item, itemIndex) => {
                                        const { display, title, subtitle } = itemSummary(item, translator, showKanji);
                                        const expanded = activeSelection?.sectionIndex === sectionIndex
                                            && activeSelection.itemIndex === itemIndex;
                                        const detailsId = `grading-item-${subject}-${sectionIndex}-${itemIndex}`;
                                        const isFundamentals = item.term?.romaji === "kiso kamoku";
                                        const isKumiEmbu = item.term?.romaji === "kumi embu";
                                        const fundamentalItems = item.items ?? [];
                                        const completedFundamentalCount = selectedGrade && isFundamentals
                                            ? fundamentalItems.filter(fundamentalItem => {
                                                const key = gradingCompletionKey(selectedGrade, fundamentalItem);
                                                return key && gradingFundamentalCompletions[key];
                                              }).length
                                            : 0;
                                        const rowContent = (
                                            <>
                                                <span className="grading-outline-copy">
                                                    <span className="grading-outline-title">{title}</span>
                                                    {subtitle && <span className="grading-outline-subtitle">{subtitle}</span>}
                                                </span>
                                                <span className="grading-outline-meta">
                                                    {item.points != null && <span>{item.points}{translator.translate("p")}</span>}
                                                    {isFundamentals && (
                                                        <GradingCompletionProgress
                                                            completed={completedFundamentalCount}
                                                            total={fundamentalItems.length}
                                                            translator={translator}
                                                        />
                                                    )}
                                                    <DisclosureChevron expanded={expanded} />
                                                </span>
                                            </>
                                        );

                                        return (
                                            <article className={`grading-outline-item grading-category-item${expanded ? " is-expanded" : ""}`} key={`item-${sectionIndex}-${itemIndex}`}>
                                                <div className="grading-outline-row grading-outline-row-without-completion">
                                                    {selectedGrade ? (
                                                        <button
                                                            type="button"
                                                            className="grading-outline-trigger"
                                                            aria-expanded={expanded}
                                                            aria-controls={detailsId}
                                                            onClick={() => toggleTechnicalCategory(sectionIndex, itemIndex)}
                                                        >
                                                            {rowContent}
                                                        </button>
                                                    ) : (
                                                        <div className="grading-outline-summary">{rowContent}</div>
                                                    )}
                                                </div>

                                                {expanded && selectedGrade && (
                                                    <div id={detailsId} className="grading-outline-detail grading-category-detail grading-detail-enter">
                                                        {display.gloss && <div className="text-muted small mb-2">({display.gloss})</div>}
                                                        {isFundamentals ? (
                                                            <FundamentalsDetail
                                                                item={item}
                                                                grade={selectedGrade}
                                                                translator={translator}
                                                                showKanji={showKanji}
                                                                completions={gradingFundamentalCompletions}
                                                                expandedKey={expandedFundamental}
                                                                onExpandedChange={setExpandedFundamental}
                                                            />
                                                        ) : isKumiEmbu ? (
                                                            <KumiEmbuDetail
                                                                item={item}
                                                                techniques={kumiEmbuTechniques}
                                                                dojoMode={dojoMode}
                                                            />
                                                        ) : (
                                                            <ItemDetail
                                                                item={item}
                                                                translator={translator}
                                                                showKanji={showKanji}
                                                                hokeiMap={hokeiMap}
                                                                dojoMode={dojoMode}
                                                                showGloss={false}
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grading-outline">
                                    {section.items.map((item, itemIndex) => {
                                        const { title, subtitle } = itemSummary(item, translator, showKanji);
                                        const expandable = hasExpandableContent(item);
                                        const expanded = activeSelection?.sectionIndex === sectionIndex
                                            && activeSelection.itemIndex === itemIndex;
                                        const detailsId = `grading-item-${subject}-${sectionIndex}-${itemIndex}`;
                                        const completionKey = selectedGrade
                                            ? gradingCompletionKey(selectedGrade, item)
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
                                                    {expandable && <DisclosureChevron expanded={expanded} />}
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
                                                            <CompletionMark completed={completed} className="grading-completion-circle" />
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

const KumiEmbuDetail = ({ item, techniques, dojoMode }: {
    item: Item;
    techniques: KumiEmbuTechniqueLink[];
    dojoMode: boolean;
}) => {
    const translator = useContext(TranslatorContext);

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
                            const completionKey = gradingCompletionKey(grade, fundamentalItem);
                            const completed = completionKey ? !!completions[completionKey] : false;
                            const rowContent = (
                                <>
                                    <span className="grading-fundamental-copy">
                                        <span className="grading-fundamental-title">{title}</span>
                                        {subtitle && <span className="grading-fundamental-subtitle">{subtitle}</span>}
                                    </span>
                                    <span className="grading-fundamental-meta">
                                        {fundamentalItem.points != null && <span>{fundamentalItem.points}{translator.translate("p")}</span>}
                                        {expandable && <DisclosureChevron expanded={expanded} />}
                                    </span>
                                </>
                            );

                            return (
                                <article className={`grading-fundamental-item${expanded ? " is-expanded" : ""}${completed ? " is-complete" : ""}`} key={rowKey}>
                                    <div className="grading-fundamental-row">
                                        {completionKey && (
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
                                                <CompletionMark completed={completed} className="grading-completion-circle" />
                                            </label>
                                        )}
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

const TechniqueGroups = ({ groups, translator, showKanji, parentTerm, structured = false }: { groups: TechniqueGroup[] | undefined; translator: Translator; showKanji: boolean; parentTerm?: string; structured?: boolean }) => {
    const displayGroups = structured ? fundamentalTechniqueGroupsForDisplay(parentTerm, groups) : groups;

    return <>
        {displayGroups?.map((group, groupIndex) => (
            <div key={groupIndex} className={structured ? "grading-technique-group" : "mb-2"}>
                {(group.context?.text || structuredTechniqueGroupLabel(parentTerm, groupIndex, displayGroups.length)) && (
                    <div className={structured ? "grading-technique-group-title" : "text-muted small mb-1"}>
                        {translator.translate(group.context?.text ?? structuredTechniqueGroupLabel(parentTerm, groupIndex, displayGroups.length)!)}
                    </div>
                )}
                <ul className={`grading-technique-list${structured ? "" : " grading-technique-list-compact"}`}>
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
};

export default GradingTest;
