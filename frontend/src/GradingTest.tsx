import { useContext, useMemo, useState } from "react";
import { Badge, Button, Form } from "react-bootstrap";
import { XLg } from "react-bootstrap-icons";
import CollapsibleCard from "./components/CollapsibleCard";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext, type Translator } from "./i18n";
import { humanGradeName, isHokeiMoment, type GradeName, type GradePlan, type HokeiMoment, type TanenKihonHokei, type Video } from "./data";
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

function itemDisplay(item: Item, translator: Translator): ItemDisplay {
    const kanji = item.term?.romaji ? translator.japanese(item.term.romaji) : undefined;
    const kanjiDisplay = kanji !== item.term?.romaji ? kanji : undefined;
    const gloss = item.term?.gloss ? translator.translate(item.term.gloss) : undefined;
    if (item.text) {
        return {
            primary: translator.translate(item.text),
            romajiSecondary: translator.isJapanese ? undefined : item.term?.romaji,
            kanji: translator.isJapanese ? undefined : kanjiDisplay,
            gloss,
        };
    }
    if (translator.isJapanese && kanjiDisplay) {
        return { primary: kanjiDisplay, gloss };
    }
    return {
        primary: item.term?.romaji ?? "",
        kanji: kanjiDisplay,
        gloss,
    };
}

const sentenceCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function hasExpandableContent(item: Item): boolean {
    return !!(item.annotations?.length || item.techniqueGroups?.length || item.items?.length);
}

const GradingTest = ({ grade, allGradePlans, notesData, ranksData }: GradingTestProps) => {
    const translator = useContext(TranslatorContext);

    const availableGrades = allGradePlans.filter(plan => allGrades[plan.grade] !== undefined);
    const defaultGrade = grade && allGrades[grade] !== undefined ? grade : availableGrades[0]?.grade;

    const [selectedGrade, setSelectedGrade] = useState<GradeName | undefined>(defaultGrade);
    const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    const hokeiMap = useMemo(() => {
        const map = new Map<string, HokeiMoment>();
        for (const plan of allGradePlans)
            for (const week of plan.weeks)
                if ("moments" in week)
                    for (const m of week.moments.filter(isHokeiMoment))
                        map.set(m.hokei_name, m);
        return map;
    }, [allGradePlans]);

    const gradeLabel = (name: GradeName): string => {
        const humanName = humanGradeName(name);
        if (!translator.isJapanese)
            return `${translator.translate(humanName, { capitalize: true })} (${translator.japanese(humanName)})`;
        return translator.japanese(humanName);
    };

    const manual = selectedGrade ? allGrades[selectedGrade] : undefined;
    if (!manual) {
        return (
            <div className="grading-test-page">
                <p className="text-muted mb-0">{translator.translate("Information för graderingstest saknas.")}</p>
            </div>
        );
    }

    const closeItem = () => { setSelectedSectionIndex(null); setSelectedItem(null); };

    return (
        <div className="grading-test-page">
                <Form.Select
                    className="mb-3"
                    value={selectedGrade}
                    onChange={e => {
                        setSelectedGrade(e.target.value as GradeName);
                        setSelectedSectionIndex(null);
                        setSelectedItem(null);
                    }}
                >
                    {availableGrades.map(plan => (
                        <option key={plan.grade} value={plan.grade}>
                            {gradeLabel(plan.grade)}
                        </option>
                    ))}
                </Form.Select>
                <h2>{translator.translate(manual.title)}</h2>
                {manual.term && !translator.isJapanese && <div className="text-muted small mb-3">{sentenceCase(manual.term.romaji)}</div>}

                {selectedItem !== null && selectedSectionIndex !== null ? (
                    <div className="grading-section-body grading-detail-enter">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <h3 className="mb-0">
                                    {sentenceCase(translator.translate(manual.sections[selectedSectionIndex].title))}
                                </h3>
                                {!translator.isJapanese && manual.sections[selectedSectionIndex].term?.romaji && (
                                    <div className="text-muted small">{sentenceCase(manual.sections[selectedSectionIndex].term!.romaji)}</div>
                                )}
                            </div>
                            <Button variant="link" size="sm" onClick={closeItem} aria-label="Stäng" className="text-body p-0">
                                <XLg size={14} />
                            </Button>
                        </div>
                        <ItemDetail item={selectedItem} translator={translator} hokeiMap={hokeiMap} notesData={notesData} ranksData={ranksData} />
                    </div>
                ) : (
                    manual.sections.map((section, si) => {
                        const gridItems: GridItem[] = section.items.map((item, i) => {
                            const display = itemDisplay(item, translator);
                            const subtitleParts = [display.romajiSecondary, display.kanji].filter((v): v is string => !!v);
                            const subtitle = subtitleParts.length > 0 ? sentenceCase(subtitleParts.join(" · ")) : undefined;
                            return {
                                key: `item-${si}-${i}`,
                                title: sentenceCase(display.primary),
                                subtitle,
                                badge: item.points != null ? <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge> : undefined,
                                onSelect: hasExpandableContent(item) ? () => { setSelectedSectionIndex(si); setSelectedItem(item); } : undefined,
                            };
                        });
                        return (
                            <div key={`section-${si}`} className={si > 0 ? "mt-4" : ""}>
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


const ItemDetail = ({ item, translator, hokeiMap, notesData, ranksData }: { item: Item; translator: Translator; hokeiMap: Map<string, HokeiMoment>; notesData: HokeiNotes; ranksData: HokeiRanks }) => {
    const display = itemDisplay(item, translator);

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
                    <SubItemCard key={i} item={subItem} translator={translator} showEmojiNumbers={item.term?.romaji === "kumi embu"} showHokeiCards={item.term?.romaji === "kumi embu" || item.term?.romaji === "hōkei kamoku"} hokeiMap={hokeiMap} notesData={notesData} ranksData={ranksData} />
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

const SubItemCard = ({ item, translator, showEmojiNumbers, showHokeiCards, hokeiMap, notesData, ranksData }: { item: Item; translator: Translator; showEmojiNumbers?: boolean; showHokeiCards?: boolean; hokeiMap?: Map<string, HokeiMoment>; notesData?: HokeiNotes; ranksData?: HokeiRanks }) => {
    const display = itemDisplay(item, translator);
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
                        <HokeiCard key={h.hokei_name} hokei={h} compact notesData={notesData} ranksData={ranksData} />
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
                                    {!translator.isJapanese && hasKanji && <span className="text-muted ms-1 small">{techKanji}</span>}
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
                const subDisplay = itemDisplay(subItem, translator);
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
