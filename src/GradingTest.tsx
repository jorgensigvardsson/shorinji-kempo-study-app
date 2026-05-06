import { useState } from "react";
import { Badge, Card } from "react-bootstrap";
import { ChevronLeft } from "react-bootstrap-icons";
import CollapsibleCard from "./components/CollapsibleCard";
import Grid, { type GridItem } from "./components/Grid";
import rawData from "../data/file.json";

interface Translatable {
    sv: string;
    key?: string;
}

interface Term {
    kanji?: string;
    romaji: string;
    gloss?: Translatable;
}

interface Numbering {
    style: "bullet" | "numeric" | "paren" | "circled";
    value?: number;
}

interface Annotation {
    marker: "kome" | "asterisk";
    text: Translatable;
}

interface TechniqueGroup {
    context?: { kanji?: string; text?: Translatable };
    techniques: Term[];
}

interface Item {
    numbering?: Numbering;
    term?: Term;
    text?: Translatable;
    points?: number;
    annotations?: Annotation[];
    techniqueGroups?: TechniqueGroup[];
    items?: Item[];
}

interface Section {
    marker?: string;
    term?: Term;
    title: Translatable;
    items: Item[];
}

interface GradeManual {
    grade: string;
    term?: Term;
    title: Translatable;
    sections: Section[];
}

const manual = rawData as unknown as GradeManual;

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

function itemDisplay(item: Item): ItemDisplay {
    if (item.text?.sv) {
        return {
            primary: item.text.sv,
            romajiSecondary: item.term?.romaji,
            kanji: item.term?.kanji,
            gloss: item.term?.gloss?.sv,
        };
    }
    return {
        primary: item.term?.romaji ?? "",
        kanji: item.term?.kanji,
        gloss: item.term?.gloss?.sv,
    };
}

function hasExpandableContent(item: Item): boolean {
    return !!(item.annotations?.length || item.techniqueGroups?.length || item.items?.length);
}

const GradingTest = () => {
    const [selectedSection, setSelectedSection] = useState<Section | null>(null);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    if (!selectedSection) {
        const gridItems: GridItem[] = manual.sections.map((section, i) => ({
            key: `section-${i}`,
            title: section.title.sv,
            subtitle: section.term?.romaji,
            onSelect: () => setSelectedSection(section),
        }));

        return (
            <div>
                <Card className="app-grid-panel mb-2">
                    <Card.Body>
                        <h2>{manual.title.sv}</h2>
                        {manual.term && <div className="text-muted small">{manual.term.romaji}</div>}
                    </Card.Body>
                </Card>
                <Grid items={gridItems} />
            </div>
        );
    }

    if (!selectedItem) {
        const gridItems: GridItem[] = selectedSection.items.map((item, i) => {
            const display = itemDisplay(item);
            const prefix = formatNumbering(item.numbering);
            const showPrefix = item.numbering?.style !== "bullet" && !!prefix;
            const title = showPrefix ? `${prefix} ${display.primary}` : display.primary;
            const subtitleParts = [display.romajiSecondary, display.kanji].filter((v): v is string => !!v);
            const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

            return {
                key: `item-${i}`,
                title,
                subtitle,
                badge: item.points != null ? <Badge bg="secondary">{item.points}p</Badge> : undefined,
                onSelect: hasExpandableContent(item) ? () => setSelectedItem(item) : undefined,
            };
        });

        return (
            <div>
                <BackPanel
                    title={selectedSection.title.sv}
                    subtitle={selectedSection.term?.romaji}
                    onBack={() => setSelectedSection(null)}
                />
                <Grid items={gridItems} />
            </div>
        );
    }

    return (
        <div>
            <BackPanel
                title={selectedSection.title.sv}
                subtitle={selectedSection.term?.romaji}
                onBack={() => setSelectedItem(null)}
            />
            <ItemDetail item={selectedItem} />
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
        <span className="fw-semibold">{title}</span>
        {subtitle && <span className="text-muted small">· {subtitle}</span>}
    </div>
);

const ItemDetail = ({ item }: { item: Item }) => {
    const display = itemDisplay(item);
    const prefix = formatNumbering(item.numbering);
    const showPrefix = item.numbering?.style !== "bullet" && !!prefix;
    const title = showPrefix ? `${prefix} ${display.primary}` : display.primary;

    return (
        <Card className="app-grid-card">
            <Card.Body>
                <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <h3 className="mb-0">{title}</h3>
                        {display.gloss && <div className="text-muted small">({display.gloss})</div>}
                        {display.romajiSecondary && <div className="text-muted small fst-italic">{display.romajiSecondary}</div>}
                        {display.kanji && <div className="text-muted small">{display.kanji}</div>}
                    </div>
                    {item.points != null && <Badge bg="secondary">{item.points}p</Badge>}
                </div>
                {item.annotations?.map((ann, i) => (
                    <p key={i} className="text-muted small fst-italic mb-2">* {ann.text.sv}</p>
                ))}
                <div className="d-flex flex-column gap-2">
                    {item.items?.map((subItem, i) => (
                        <SubItemCard key={i} item={subItem} />
                    ))}
                </div>
            </Card.Body>
        </Card>
    );
};

const SubItemCard = ({ item }: { item: Item }) => {
    const display = itemDisplay(item);
    const prefix = formatNumbering(item.numbering);
    const hasContent = hasExpandableContent(item);

    const header = (
        <div className="d-flex justify-content-between align-items-start w-100">
            <div>
                {prefix && <span className="text-muted me-1 small">{prefix}</span>}
                <span className="fw-semibold">{display.primary}</span>
                {display.gloss && <span className="text-muted ms-1 small">({display.gloss})</span>}
                {display.romajiSecondary && <div className="text-muted small fst-italic">{display.romajiSecondary}</div>}
                {display.kanji && <div className="text-muted small">{display.kanji}</div>}
            </div>
            {item.points != null && <Badge bg="secondary" className="ms-2 flex-shrink-0">{item.points}p</Badge>}
        </div>
    );

    return (
        <CollapsibleCard
            className="hokei-card"
            header={header}
            showCollapse={hasContent}
        >
            {item.annotations?.map((ann, i) => (
                <p key={i} className="text-muted small fst-italic mb-2">* {ann.text.sv}</p>
            ))}
            {item.techniqueGroups?.map((group, gi) => (
                <div key={gi} className="mb-2">
                    {group.context?.text && (
                        <div className="text-muted small mb-1">{group.context.text.sv}</div>
                    )}
                    <ul className="mb-0">
                        {group.techniques.map((tech, ti) => (
                            <li key={ti}>{tech.romaji}</li>
                        ))}
                    </ul>
                </div>
            ))}
            {item.items?.map((subItem, i) => {
                const subDisplay = itemDisplay(subItem);
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
