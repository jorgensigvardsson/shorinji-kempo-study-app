import { useContext, useState } from "react";
import { Badge, Card } from "react-bootstrap";
import { ChevronLeft } from "react-bootstrap-icons";
import CollapsibleCard from "./components/CollapsibleCard";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext, type Translator } from "./i18n";
import type { GradeName } from "./data";
import gradingExamInformation from "./assets/grading-exam-information.json";

interface GradingTestProps {
    grade: GradeName | undefined;
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

function hasExpandableContent(item: Item): boolean {
    return !!(item.annotations?.length || item.techniqueGroups?.length || item.items?.length);
}

const GradingTest = ({ grade }: GradingTestProps) => {
    const translator = useContext(TranslatorContext);
    const [selectedSection, setSelectedSection] = useState<Section | null>(null);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    const manual = grade ? allGrades[grade] : undefined;
    if (!manual) {
        return (
            <Card className="app-grid-panel">
                <Card.Body>
                    <p className="text-muted mb-0">{translator.translate("Information för graderingstest saknas.")}</p>
                </Card.Body>
            </Card>
        );
    }

    if (!selectedSection) {
        const gridItems: GridItem[] = manual.sections.map((section, i) => ({
            key: `section-${i}`,
            title: <span style={{ textTransform: "capitalize" }}>{translator.translate(section.title)}</span>,
            subtitle: translator.isJapanese ? undefined : section.term?.romaji,
            onSelect: () => setSelectedSection(section),
        }));

        return (
            <div>
                <Card className="app-grid-panel mb-2">
                    <Card.Body>
                        <h2>{translator.translate(manual.title)}</h2>
                        {manual.term && !translator.isJapanese && <div className="text-muted small">{manual.term.romaji}</div>}
                    </Card.Body>
                </Card>
                <Grid items={gridItems} />
            </div>
        );
    }

    if (!selectedItem) {
        const gridItems: GridItem[] = selectedSection.items.map((item, i) => {
            const display = itemDisplay(item, translator);
            const subtitleParts = [display.romajiSecondary, display.kanji].filter((v): v is string => !!v);
            const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

            return {
                key: `item-${i}`,
                title: display.primary,
                subtitle,
                badge: item.points != null ? <Badge bg="secondary">{item.points}{translator.translate("p")}</Badge> : undefined,
                onSelect: hasExpandableContent(item) ? () => setSelectedItem(item) : undefined,
            };
        });

        return (
            <div>
                <BackPanel
                    title={translator.translate(selectedSection.title)}
                    subtitle={translator.isJapanese ? undefined : selectedSection.term?.romaji}
                    onBack={() => setSelectedSection(null)}
                />
                <Grid items={gridItems} />
            </div>
        );
    }

    return (
        <div>
            <BackPanel
                title={translator.translate(selectedSection.title)}
                subtitle={translator.isJapanese ? undefined : selectedSection.term?.romaji}
                onBack={() => setSelectedItem(null)}
            />
            <ItemDetail item={selectedItem} translator={translator} />
        </div>
    );
};

interface BackPanelProps {
    title: string;
    subtitle?: string;
    onBack: () => void;
}

const BackPanel = ({ title, subtitle, onBack }: BackPanelProps) => (
    <div
        className="app-grid-panel mb-2 d-flex align-items-center gap-2"
        style={{ cursor: "pointer" }}
        onClick={onBack}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onBack(); }}
    >
        <ChevronLeft size={16} />
        <span className="fw-semibold" style={{ textTransform: "capitalize" }}>{title}</span>
        {subtitle && <span className="text-muted small">· {subtitle}</span>}
    </div>
);

const ItemDetail = ({ item, translator }: { item: Item; translator: Translator }) => {
    const display = itemDisplay(item, translator);

    return (
        <Card className="app-grid-card">
            <Card.Body>
                <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h3 className="mb-0">{display.primary}</h3>
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
                        <SubItemCard key={i} item={subItem} translator={translator} showEmojiNumbers={item.term?.romaji === "kumi embu"} />
                    ))}
                </div>
            </Card.Body>
        </Card>
    );
};

const emojiNumbers = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const SubItemCard = ({ item, translator, showEmojiNumbers }: { item: Item; translator: Translator; showEmojiNumbers?: boolean }) => {
    const display = itemDisplay(item, translator);
    const hasContent = hasExpandableContent(item);
    const numEmoji = showEmojiNumbers && item.numbering?.style === "paren" && item.numbering.value != null
        ? (emojiNumbers[item.numbering.value] ?? `(${item.numbering.value})`)
        : undefined;

    const header = (
        <div className="d-flex justify-content-between align-items-start w-100">
            <div>
                {numEmoji && <span className="me-2">{numEmoji}</span>}
                <span className="fw-semibold">{display.primary}</span>
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
        >
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {translator.translate(ann.text)}</p>
            ))}
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
