import { useContext, useEffect, useRef, useState } from "react";
import CollapsibleCard from "../CollapsibleCard";
import { humanLevelName, type HokeiExercise, type HokeiStance, type LevelName } from "../data";
import { useTheme } from "../hooks";
import { TranslatorContext, type Translator } from "../i18n";
import { cardHead, type HeadOptions } from "../utilities/CardUtilities";
import type { Variant } from "react-bootstrap/esm/types";
import { Badge, Col, Container, Form, Row } from "react-bootstrap";
import { ChatFill, JournalText } from "react-bootstrap-icons";
import type { HokeiNotes } from "../persistence/app-data";
import { CardSettingsContext } from "../persistence/card-settings";

interface HokeiCardProps {
    hokei: HokeiExercise;
    notesData: HokeiNotes;
    className?: string;
    levelName?: LevelName;
}

const HokeiCard = (props: HokeiCardProps) => {
    const { hokei, className, notesData, levelName } = props;
    const translator = useContext(TranslatorContext);
    const [hasNotes, setHasNotes] = useState(!!notesData.getNotes(hokei.hokei.name));

    const cardSettings = useContext(CardSettingsContext);

    useEffect(() => notesData.registerListener(hokei.hokei.name, note => setHasNotes(!!note)), [notesData]);

    const options: HeadOptions = {
        badges: [],
        emSize: cardSettings.cardTextSize
    };

    if(levelName) {
        options.badges!.push({ text: humanLevelName(levelName), variant: levelNameVariant(levelName) })
    }

    options.badges!.push(...(hokei.hokei.variations ?? []).map(v => ({ variant: "secondary", text: v })));

    if (hasNotes)
        options.icons = [<ChatFill/>];

    return (
        <CollapsibleCard header={cardHead(translator, hokei.hokei.name, options)}
                         footer={<CardFooter notesData={notesData} hokei={hokei}/>}
                         className={className}>
            <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                <HokeiStanceElement hokei={hokei} stance={hokei.stance}/>
                <HokeiIndividualsElement hokei={hokei}/>
                <Container className="p-0 mt-2">
                    <Badge>{hokei.hokei.group}</Badge>
                </Container>
            </div>
        </CollapsibleCard>
    )
}

interface CardFooterProps {
    hokei: HokeiExercise;
    notesData: HokeiNotes;
}

const CardFooter = ({hokei, notesData}: CardFooterProps) => {
    const [notes, setNotes] = useState(notesData.getNotes(hokei.hokei.name));
    const [notesAreShown, setNotesAreShown] = useState<boolean>(!!notes);
    const notesRef = useRef<HTMLTextAreaElement>(null);
    const translator = useContext(TranslatorContext);
    
    useEffect(() => notesData.registerListener(hokei.hokei.name, note => setNotes(note)), [notesData]);

    const persistNotes = () => {
        let processedNotes = notes;
        if (processedNotes !== null)
            processedNotes = processedNotes.trim();
        notesData.setNotes(hokei.hokei.name, processedNotes);
    }

    // Focus when show changes to true
    useEffect(() => {
        if (notesAreShown && notesRef.current) {
            notesRef.current.focus();
            notesRef.current.selectionStart = notesRef.current.selectionEnd = notesRef.current.value.length;
            notesRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
        }
    }, [notesAreShown]);

    return (
        <Container>
            <Row>
                <Col>
                    <div style={{ display: "flex", alignItems: "center" }} onClick={() => setNotesAreShown(!notesAreShown)}>
                        <JournalText style={{marginRight: "0.5em"}}/>
                        {translator.translate('Anteckningar')}
                    </div>
                </Col>
                {hokei.kyohan && <Col>
                    <div className="float-end">
                        {translator.translate("Kyohan")} {hokei.kyohan.map(k => translator.translate(k)).join(', ')}
                    </div>
                </Col>}
            </Row>
            {notesAreShown && <Row>
                <Col>
                    <Form.Control className="mt-2 mb-3" as="textarea" rows={5} ref={notesRef} value={notes ?? ""}
                                    onChange={e => setNotes(e.target.value)} onBlur={() => persistNotes()}/>
                </Col>
            </Row>}
        </Container>
    )
}

function stanceIcon(effectiveTheme: string, stance: HokeiStance) {
    const iconFileName = `${stance.toLowerCase().replace(/\s+/g, '_')}${effectiveTheme === "dark" ? '_dark' : ''}.png`;
    return <img className="stance-icon" src={`/${iconFileName}`} />;
}

function levelNameVariant(v: LevelName): Variant {
    switch (v) {
        case "Kyu6":
        case "Kyu5":
        case "Kyu4":
            return "darkgreen";
        case "Kyu3":
        case "Kyu2":
        case "Kyu1":
            return "SaddleBrown";
        default:
            return "black";
    }
}

interface HokeiStanceElementProps {
    hokei: HokeiExercise;
    stance: HokeiStance[];
}

const HokeiStanceElement = ({ hokei, stance }: HokeiStanceElementProps) => {
    if (!stance || stance.length === 0)
        return null;

    const translator = useContext(TranslatorContext);
    const effectiveTheme = useTheme();

    return (
        <table>
            <thead>
                <tr>
                    <th colSpan={2}>
                        Uppställning
                    </th>
                </tr>
            </thead>
            {stance.map((s, index) => {
                return (<tbody key={`${hokei.uniqueId}-stance-${index}`}>
                    <tr><td>{translator.translate(s)}</td><td rowSpan={translator.isJapanese ? 1 : 2} className="ps-5">{stanceIcon(effectiveTheme.effectiveTheme, s)}</td></tr>
                    {!translator.isJapanese && <tr className="japanese-subtitle text-muted"><td>{translator.japanese(s)}</td></tr>}
                </tbody>)
            })}
        </table>
    )
}

interface HokeiIndividualsElementProps {
    hokei: HokeiExercise
}

const HokeiIndividualsElement = ({ hokei }: HokeiIndividualsElementProps) => {
    if (!hokei.offensiveIndividual || !hokei.defensiveIndividual)
        return null;

    const translator = useContext(TranslatorContext);

    return (
        <>
            {renderStances(translator, hokei)}
            {renderExecutions(translator, hokei)}
        </>
    )
}

const renderStances = (translator: Translator, hokei: HokeiExercise) => {
    if (!hokei.offensiveIndividual && !hokei.defensiveIndividual)
        return null;

    return (
        <table className="hokei-individuals-table mt-3">
            <thead>
                <tr>
                    <th colSpan={2}>
                        Stans
                    </th>
                </tr>
            </thead>
            <tbody style={{verticalAlign: "top"}}>
                {hokei.offensiveIndividual && 
                    <tr>
                        <td >{translator.translate("(A)")}</td><td>{translator.translate(hokei.offensiveIndividual.stance.name)}</td>
                    </tr>
                }
                {hokei.offensiveIndividual && !translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.offensiveIndividual.stance.name)}</td>
                    </tr>
                }
                {hokei.defensiveIndividual && 
                    <tr>
                        <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.defensiveIndividual.stance.name)}</td>
                    </tr>
                }
                {hokei.defensiveIndividual && !translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.defensiveIndividual.stance.name)}</td>
                    </tr>
                }
            </tbody>
        </table>
    );
}

const renderExecutions = (translator: Translator, hokei: HokeiExercise) => {
    if (!hokei.offensiveIndividual?.technique && !hokei.defensiveIndividual?.technique)
        return null;

    const renhanko = hokei.hokei.renhanko ? <i> ({translator.translate("ren hankō")})</i> : undefined;
    const japaneseRenhanko = hokei.hokei.renhanko ? <i> ({translator.japanese("ren hankō")})</i> : undefined;

    return (
        <table className="hokei-individuals-table mt-3">
            <thead>
                <tr>
                    <th colSpan={2}>
                        Utförande
                    </th>
                </tr>
            </thead>
            {hokei.offensiveIndividual?.technique && <tbody style={{verticalAlign: "top"}}>
                <tr>
                    <td>{translator.translate("(A)")}</td><td>{translator.translate(hokei.offensiveIndividual.technique.name)}</td>
                </tr>
                {!translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.offensiveIndividual.technique.name)}</td>
                    </tr>
                }
            </tbody>}
            {hokei.defensiveIndividual?.technique && <tbody style={{verticalAlign: "top"}}>
                <tr>
                    <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.defensiveIndividual.technique.name)}{renhanko}</td>
                </tr>
                {!translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.defensiveIndividual.technique.name)}{japaneseRenhanko}</td>
                    </tr>
                }
            </tbody>}
        </table>
    );
}

export default HokeiCard;
