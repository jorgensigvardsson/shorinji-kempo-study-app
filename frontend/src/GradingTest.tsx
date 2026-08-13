import { useContext, useMemo, useState } from "react";
import { Badge, Button } from "react-bootstrap";
import { XLg } from "react-bootstrap-icons";
import CollapsibleCard from "./components/CollapsibleCard";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext, type Translator } from "./i18n";
import { useShowKanji } from "./hooks";
import { isHokeiMoment, type GradeName, type GradePlan, type HokeiMoment, type TanenKihonHokei, type Video } from "./data";
import HokeiCard from "./components/HokeiCard";
import VideoLink from "./components/VideoLink";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data";
import gradingExamInformation from "./assets/grading-exam-information.json";
import tanenKihonHokeiData from "./assets/tanen_kihon_hokei.json";
import { findTanenMatches, tanenMatchesToVideos } from "./utilities/TanenUtils";

const tanenKihonHokeiMap = new Map<string, TanenKihonHokei>(
    (tanenKihonHokeiData as TanenKihonHokei[]).map(t => [t.hokei_name.trim(), t])
);
import "./GradingTest.css";

interface GradingTestProps {
    grade: GradeName | undefined;
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
    subject: "theory" | "technical";
    dojoMode?: boolean;
}

interface Term {
    romaji: string;
    gloss?: string;
}

interface Numbering {
    style: "bullet" | "numeric" | "paren" | "circled";
    value?: number;
}

interface Annotation {
    marker: "kome" | "asterisk";
    text: string;
}

interface TechniqueGroup {
    context?: { kanji?: string; text?: string };
    techniques: Term[];
}

interface Item {
    numbering?: Numbering;
    term?: Term;
    text?: string;
    description?: string;
    points?: number;
    annotations?: Annotation[];
    techniqueGroups?: TechniqueGroup[];
    items?: Item[];
    videos?: Video[];
}

interface Section {
    marker?: string;
    term?: Term;
    title: string;
    items: Item[];
}

interface GradeManual {
    term?: Term;
    title: string;
    sections: Section[];
}

const allGrades = gradingExamInformation as unknown as Partial<Record<GradeName, GradeManual>>;

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
    "kumi embu": "Parembu",
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
    return !!(item.annotations?.length || item.techniqueGroups?.length || item.items?.length);
}

const GradingTest = ({ grade, allGradePlans, notesData, ranksData, subject, dojoMode = false }: GradingTestProps) => {
    const translator = useContext(TranslatorContext);
    const showKanji = useShowKanji() && !dojoMode;
    const selectedGrade = grade && allGrades[grade] !== undefined ? grade : undefined;
    const [selection, setSelection] = useState<{ grade: GradeName; sectionIndex: number; item: Item } | null>(null);
    const activeSelection = selection?.grade === selectedGrade ? selection : null;

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

    const closeItem = () => setSelection(null);

    return (
        <div className={`grading-test-page${dojoMode ? " is-dojo-mode" : ""}`}>
                <h2>{translator.translate(manual.title)}</h2>
                {manual.term && !translator.isJapanese && <div className="text-muted small mb-3">{sentenceCase(manual.term.romaji)}</div>}

                {activeSelection !== null ? (
                    <div className="grading-section-body grading-detail-enter">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <h3 className="mb-0">
                                    {sentenceCase(translator.translate(manual.sections[activeSelection.sectionIndex].title))}
                                </h3>
                                {!translator.isJapanese && manual.sections[activeSelection.sectionIndex].term?.romaji && (
                                    <div className="text-muted small">{sentenceCase(manual.sections[activeSelection.sectionIndex].term!.romaji)}</div>
                                )}
                            </div>
                            <Button variant="link" size="sm" onClick={closeItem} aria-label="Stäng" className="text-body p-0">
                                <XLg size={14} />
                            </Button>
                        </div>
                        <ItemDetail item={activeSelection.item} translator={translator} showKanji={showKanji} hokeiMap={hokeiMap} notesData={notesData} ranksData={ranksData} dojoMode={dojoMode} />
                    </div>
                ) : (
                    sections.map(({ section, sectionIndex }) => {
                        const gridItems: GridItem[] = section.items.map((item, i) => {
                            const display = itemDisplay(item, translator, showKanji);
                            const subtitleParts = [display.romajiSecondary, display.kanji].filter((v): v is string => !!v);
                            const subtitle = subtitleParts.length > 0 ? sentenceCase(subtitleParts.join(" · ")) : undefined;
                            return {
                                key: `item-${sectionIndex}-${i}`,
                                title: sentenceCase(display.primary),
                                subtitle,
                                badge: item.points != null ? <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge> : undefined,
                                onSelect: hasExpandableContent(item) && selectedGrade
                                    ? () => setSelection({ grade: selectedGrade, sectionIndex, item })
                                    : undefined,
                            };
                        });
                        return (
                            <div key={`section-${sectionIndex}`}>
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <div>
                                        <h3 className="mb-0">{sentenceCase(translator.translate(section.title))}</h3>
                                        {!translator.isJapanese && section.term?.romaji && (
                                            <span className="text-muted small">{sentenceCase(section.term.romaji)}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="grading-section-body">
                                    <Grid items={gridItems} />
                                </div>
                            </div>
                        );
                    })
                )}
        </div>
    );
};


const ItemDetail = ({ item, translator, showKanji, hokeiMap, notesData, ranksData, dojoMode }: { item: Item; translator: Translator; showKanji: boolean; hokeiMap: Map<string, HokeiMoment>; notesData: HokeiNotes; ranksData: HokeiRanks; dojoMode: boolean }) => {
    const display = itemDisplay(item, translator, showKanji);

    return (
        <div>
            <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 className="mb-0">{sentenceCase(display.primary)}</h5>
                    {display.gloss && <div className="text-muted small">({display.gloss})</div>}
                    {display.romajiSecondary && <div className="text-muted small fst-italic">{display.romajiSecondary}</div>}
                    {display.kanji && <div className="text-muted small">{display.kanji}</div>}
                </div>
                {item.points != null && <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge>}
            </div>
            {item.description && <p className="mb-2">{translator.translate(item.description)}</p>}
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {translator.translate(ann.text)}</p>
            ))}
            <div className="d-flex flex-column gap-2">
                {item.items?.map((subItem, i) => (
                    <SubItemCard key={i} item={subItem} translator={translator} showKanji={showKanji} showEmojiNumbers={item.term?.romaji === "kumi embu"} showHokeiCards={item.term?.romaji === "kumi embu" || item.term?.romaji === "hōkei kamoku"} hokeiMap={hokeiMap} notesData={notesData} ranksData={ranksData} dojoMode={dojoMode} />
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

const emojiNumbers = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function extractHokeis(romaji: string, hokeiMap: Map<string, HokeiMoment>): HokeiMoment[] {
    return romaji.replace(/\s*\(.*$/, '').trim()
        .split(/\s*&\s*/)
        .map(p => p.split(/\s+-\s+/)[0].trim())
        .map(p => hokeiMap.get(p))
        .filter((h): h is HokeiMoment => !!h);
}

const SubItemCard = ({ item, translator, showKanji, showEmojiNumbers, showHokeiCards, hokeiMap, notesData, ranksData, dojoMode }: { item: Item; translator: Translator; showKanji: boolean; showEmojiNumbers?: boolean; showHokeiCards?: boolean; hokeiMap?: Map<string, HokeiMoment>; notesData?: HokeiNotes; ranksData?: HokeiRanks; dojoMode: boolean }) => {
    const display = itemDisplay(item, translator, showKanji);
    const hokeis = showHokeiCards && hokeiMap && item.term?.romaji
        ? extractHokeis(item.term.romaji, hokeiMap)
        : [];
    const romaji = item.term?.romaji?.trim() ?? "";
    const tanenVideos: Video[] = romaji.startsWith("tan'en kihon")
        ? tanenMatchesToVideos(
            (item.techniqueGroups ?? [])
                .flatMap(g => g.techniques)
                .flatMap(t => findTanenMatches(t.romaji, tanenKihonHokeiMap,
                    romaji.includes("sōtai") ? "sōtai" : "tan'en"))
          )
        : tanenMatchesToVideos(
            tanenKihonHokeiMap.has(romaji) ? [tanenKihonHokeiMap.get(romaji)!] : []
          );
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
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {translator.translate(ann.text)}</p>
            ))}
            {hokeis.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-2">
                    {hokeis.map(h => (
                        <HokeiCard key={h.hokei_name} hokei={h} compact notesData={notesData} ranksData={ranksData} dojoMode={dojoMode} />
                    ))}
                </div>
            )}
            {item.techniqueGroups?.map((group, gi) => (
                <div key={gi} className="mb-2">
                    {group.context?.text && (
                        <div className="text-muted small mb-1">{translator.translate(group.context.text)}</div>
                    )}
                    <ul className="mb-0">
                        {group.techniques.map((tech, ti) => {
                            const techKanji = translator.japanese(tech.romaji);
                            const hasKanji = techKanji !== tech.romaji;
                            return (
                                <li key={ti}>
                                    {translator.isJapanese && hasKanji ? techKanji : tech.romaji}
                                    {!translator.isJapanese && showKanji && hasKanji && <span className="text-muted ms-1 small">{techKanji}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
            {tanenVideos.length > 0 && (
                <div className="mt-3 d-flex flex-column gap-2">
                    {tanenVideos.map(v => (
                        <VideoLink key={v.url} video={v} />
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

export default GradingTest;
