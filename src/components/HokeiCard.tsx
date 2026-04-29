import { useContext, useEffect, useRef, useState } from "react";
import CollapsibleCard from "./CollapsibleCard";
import { humanGradeName, type HokeiMoment, type GradeName } from "../data";
import { useTheme } from "../hooks";
import { TranslatorContext, type Translator } from "../i18n";
import { cardHead, type HeadOptions } from "../utilities/CardUtilities";
import type { Variant } from "react-bootstrap/esm/types";
import { Badge, Col, Container, Form, Row } from "react-bootstrap";
import { ChatFill, JournalText } from "react-bootstrap-icons";
import type { HokeiNotes, HokeiRanks } from "../persistence/app-data";
import StarRating from "./StarRating";
import type { HokeiRankValue } from "../persistence/schema";

interface HokeiCardProps {
    hokei: HokeiMoment;
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
    className?: string;
    gradeName?: GradeName;
}

const HokeiCard = (props: HokeiCardProps) => {
    const { hokei, className, notesData, ranksData, gradeName } = props;
    const translator = useContext(TranslatorContext);
    const [hasNotes, setHasNotes] = useState(!!notesData.getNotes(hokei.hokei_name));
    const [rank, setRank] = useState<HokeiRankValue | null>(ranksData.getRank(hokei.hokei_name));

    useEffect(() => notesData.registerListener(hokei.hokei_name, note => setHasNotes(!!note)), [notesData]);
    useEffect(() => ranksData.registerListener(hokei.hokei_name, setRank), [ranksData, hokei.hokei_name]);

    const options: HeadOptions = {
        badges: []
    };

    if(gradeName) {
        options.badges!.push({ text: humanGradeName(gradeName), variant: gradeNameVariant(gradeName) })
    }

    options.badges!.push(...(hokei.variations ?? []).map(v => ({ variant: "secondary", text: v })));
    options.badges!.push({ text: hokei.technique_group, variant: "primary" });

    if (hasNotes)
        options.icons = [<ChatFill key="has-notes"/>];

    options.rightNode = (
        <StarRating
            value={rank}
            onChange={(value) => ranksData.setRank(hokei.hokei_name, value)}
            groupLabel={translator.translate("Rankning")}
            getLabel={(value) => translator.translate(`Nivå ${value}`)}
        />
    );

    return (
        <CollapsibleCard header={cardHead(translator, hokei.hokei_name, options)}
                         footer={<CardFooter notesData={notesData} hokei={hokei}/>}
                         className={`app-grid-card hokei-card ${className ?? ""}`.trim()}>
            <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                {hokei.foot_stance && hokei.foot_stance.length > 0 && <FootStancesElement hokei={hokei} />}
                <HokeiIndividualsElement hokei={hokei}/>
            </div>
        </CollapsibleCard>
    )
}

interface CardFooterProps {
    hokei: HokeiMoment;
    notesData: HokeiNotes;
}

const CardFooter = ({hokei, notesData}: CardFooterProps) => {
    const [notes, setNotes] = useState(notesData.getNotes(hokei.hokei_name));
    const [notesAreShown, setNotesAreShown] = useState<boolean>(!!notes);
    const notesRef = useRef<HTMLTextAreaElement>(null);
    const translator = useContext(TranslatorContext);
    
    useEffect(() => notesData.registerListener(hokei.hokei_name, note => setNotes(note)), [notesData]);

    const persistNotes = () => {
        let processedNotes = notes;
        if (processedNotes !== null)
            processedNotes = processedNotes.trim();
        notesData.setNotes(hokei.hokei_name, processedNotes);
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
        <Container className="px-0">
            <Row>
                <Col xs="auto">
                    <div style={{ display: "flex", alignItems: "center" }} onClick={() => setNotesAreShown(!notesAreShown)}>
                        <JournalText style={{marginRight: "0.5em"}}/>
                        {translator.translate('Anteckningar')}
                    </div>
                </Col>
                {hokei.kyohan_pages && <Col>
                    <div className="float-end">
                        {translator.translate("Kyohan")} {hokei.kyohan_pages.map(k => translator.translate(k)).join(', ')}
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

function stanceIcon(effectiveTheme: string, stance: string) {
    const iconFileName = `${stance.toLowerCase().replace(/\s+/g, '_')}${effectiveTheme === "dark" ? '_dark' : ''}.png`;
    return <img className="stance-icon" src={`/${iconFileName}`} />;
}

function gradeNameVariant(v: GradeName): Variant {
    switch (v) {
        case "6 kyū":
        case "5 kyū":
        case "4 kyū":
            return "darkgreen";
        case "3 kyū":
        case "2 kyū":
        case "1 kyū":
            return "SaddleBrown";
        default:
            return "black";
    }
}

interface FootStancesElementProps {
    hokei: HokeiMoment;
}

const FootStancesElement = ({ hokei }: FootStancesElementProps) => {
    const translator = useContext(TranslatorContext);
    const effectiveTheme = useTheme();

    if (!hokei.foot_stance)
        return null;

    const renderFootStance = (s: string) => {
        return <tbody key={`${hokei.hokei_name}.${s}`}><tr><td>{translator.translate(s)}</td><td rowSpan={translator.isJapanese ? 1 : 2} className="ps-5">{stanceIcon(effectiveTheme.effectiveTheme, s)}</td></tr>
                    {!translator.isJapanese && <tr className="japanese-subtitle text-muted"><td>{translator.japanese(s)}</td></tr>}</tbody>;

    }

    return (
        <table className="mb-3">
            <thead>
                <tr>
                    <th colSpan={2}>
                        {translator.translate("Uppställning")}
                    </th>
                </tr>
            </thead>
            { hokei.foot_stance.map(s => renderFootStance(s)) }
        </table>
    )
}

interface HokeiIndividualsElementProps {
    hokei: HokeiMoment
}

const HokeiIndividualsElement = ({ hokei }: HokeiIndividualsElementProps) => {
    const translator = useContext(TranslatorContext);

    return (
        <>
            {renderStances(translator, hokei)}
            {renderActions(translator, hokei)}
        </>
    )
}

const renderStances = (translator: Translator, hokei: HokeiMoment) => {
    if (!hokei.roles.attacker.stance && !hokei.roles.defender.stance)
        return null;

    return (
        <table className="hokei-individuals-table mb-3">
            <thead>
                <tr>
                    <th colSpan={2}>
                        {translator.translate("Stans")}
                    </th>
                </tr>
            </thead>
            <tbody style={{verticalAlign: "top"}}>
                {hokei.roles.attacker.stance && 
                    <tr>
                        <td >{translator.translate("(A)")}</td><td>{translator.translate(hokei.roles.attacker.stance)}</td>
                    </tr>
                }
                {hokei.roles.attacker.stance && !translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.roles.attacker.stance)}</td>
                    </tr>
                }
                {hokei.roles.defender.stance && 
                    <tr>
                        <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.roles.defender.stance)}</td>
                    </tr>
                }
                {hokei.roles.defender.stance && !translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.roles.defender.stance)}</td>
                    </tr>
                }
            </tbody>
        </table>
    );
}

const renderActions = (translator: Translator, hokei: HokeiMoment) => {
    if (!hokei.roles.attacker.action && !hokei.roles.defender.action)
        return null;

    const renhanko = hokei.ren_hanko ? <i> ({translator.translate("ren hankō")})</i> : undefined;
    const japaneseRenhanko = hokei.ren_hanko ? <i> ({translator.japanese("ren hankō")})</i> : undefined;

    return (
        <table className="hokei-individuals-table">
            <thead>
                <tr>
                    <th colSpan={2}>
                        {translator.translate("Utförande")}
                    </th>
                </tr>
            </thead>
            {hokei.roles.attacker.action && <tbody style={{verticalAlign: "top"}}>
                <tr>
                    <td>{translator.translate("(A)")}</td><td>{translator.translate(hokei.roles.attacker.action)}</td>
                </tr>
                {!translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.roles.attacker.action)}</td>
                    </tr>
                }
            </tbody>}
            {hokei.roles.defender.action && <tbody style={{verticalAlign: "top"}}>
                <tr>
                    <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.roles.defender.action)}{renhanko}</td>
                </tr>
                {!translator.isJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.roles.defender.action)}{japaneseRenhanko}</td>
                    </tr>
                }
            </tbody>}
        </table>
    );
}

export default HokeiCard;
