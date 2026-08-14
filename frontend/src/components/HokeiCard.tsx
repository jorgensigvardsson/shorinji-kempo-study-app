import { useContext, useEffect, useRef, useState } from "react";
import CollapsibleCard from "./CollapsibleCard";
import { humanGradeName, type HokeiMoment, type GradeName } from "../data";
import { useTheme } from "../hooks";
import { TranslatorContext, type Translator } from "../i18n";
import { cardHead, type HeadOptions } from "../utilities/CardUtilities";
import type { Variant } from "react-bootstrap/esm/types";
import { Collapse, Form } from "react-bootstrap";
import { ChatFill, ChevronDown, ChevronRight, JournalText, PersonFill, ShieldFill } from "react-bootstrap-icons";
import { setHokeiNote, setHokeiRank, useHokeiNote, useHokeiRank } from "../persistence/app-data";
import StarRating from "./StarRating";
import VideoLink from "./VideoLink";
import type { HokeiRankValue } from "../persistence/schema";
import "./HokeiCard.css";

const assessmentLabels: Record<HokeiRankValue, string> = {
    1: "Behöver träna",
    2: "Övar",
    3: "Sitter",
};

interface HokeiCardProps {
    hokei: HokeiMoment;
    // Personal marks are opt-in per card: a card used purely to illustrate a
    // technique elsewhere should not invite notes or self-assessment.
    showNotes?: boolean;
    showRating?: boolean;
    className?: string;
    gradeName?: GradeName;
    compact?: boolean;
    dojoMode?: boolean;
    kamokuLayout?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const HokeiCard = (props: HokeiCardProps) => {
    const { hokei, className, showNotes = false, showRating = false, gradeName, compact, dojoMode = false, kamokuLayout = false, defaultOpen, onOpenChange } = props;
    const translator = useContext(TranslatorContext);
    const note = useHokeiNote(hokei.hokei_name);
    const rank = useHokeiRank(hokei.hokei_name);
    const hasNotes = showNotes && !!note;
    const showKanji = !dojoMode;

    const videos = hokei.videos ?? [];
    const footer = (showNotes || videos.length > 0) ? (
        <>
            {showNotes && <CardFooter hokei={hokei}/>}
            {videos.map((video, i) => (
                <VideoLink key={video.url} video={video} className={(i > 0 || showNotes) ? "mt-2" : undefined}/>
            ))}
        </>
    ) : undefined;

    const kamokuFooter = (showNotes || videos.length > 0) ? (
        <div className="kamoku-card-footer-actions">
            {showNotes && <CardFooter hokei={hokei}/>}
            {videos.map(video => <VideoLink key={video.url} video={video} className="kamoku-video-link" />)}
        </div>
    ) : undefined;

    if (dojoMode) {
        return (
            <CollapsibleCard
                header={<DojoCardHeader hokei={hokei} />}
                footer={footer}
                focusOnOpen
                defaultOpen={defaultOpen}
                onOpenChange={onOpenChange}
                className={`app-grid-card hokei-card dojo-card ${className ?? ""}`.trim()}
            >
                <DojoCardBody hokei={hokei} />
            </CollapsibleCard>
        );
    }

    if (kamokuLayout) {
        return (
            <CollapsibleCard
                header={<KamokuCardHeader hokei={hokei} gradeName={gradeName} rank={rank} showRating={showRating} showKanji={showKanji} />}
                footer={kamokuFooter}
                focusOnOpen
                defaultOpen={defaultOpen}
                onOpenChange={onOpenChange}
                className={`app-grid-card hokei-card kamoku-full-card ${className ?? ""}`.trim()}
            >
                <KamokuCardBody hokei={hokei} showKanji={showKanji} />
            </CollapsibleCard>
        );
    }

    if (compact) {
        const name = translator.isJapanese
            ? translator.japanese(hokei.hokei_name)
            : translator.translate(hokei.hokei_name, { capitalize: true });
        const kanji = !translator.isJapanese && showKanji ? translator.japanese(hokei.hokei_name) : null;
        const showKanjiInHeader = kanji && kanji !== hokei.hokei_name;
        const compactHeader = (
            <span style={{ fontSize: "1em" }}>
                {name}
                {showKanjiInHeader && <span className="text-muted ms-2" style={{ fontSize: "0.85em" }}>{kanji}</span>}
            </span>
        );
        return (
            <CollapsibleCard header={compactHeader} inlineChevron
                             footer={footer}
                             focusOnOpen
                             defaultOpen={defaultOpen}
                             onOpenChange={onOpenChange}
                             className={`app-grid-card hokei-card ${className ?? ""}`.trim()}>
                <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                    {hokei.foot_stance && hokei.foot_stance.length > 0 && <FootStancesElement hokei={hokei} showKanji={showKanji} />}
                    <HokeiIndividualsElement hokei={hokei} showKanji={showKanji}/>
                </div>
            </CollapsibleCard>
        );
    }

    const options: HeadOptions = { badges: [], showKanji };
    if (gradeName)
        options.badges!.push({ text: humanGradeName(gradeName), variant: gradeNameVariant(gradeName) });
    options.badges!.push(...(hokei.variations ?? []).map(v => ({ variant: "secondary", text: v })));
    if (hokei.technique_group)
        options.badges!.push({ text: hokei.technique_group, variant: "primary" });
    if (hasNotes)
        options.icons = [<ChatFill key="has-notes"/>];
    if (showRating)
        options.rightNode = (
            <StarRating
                value={rank}
                onChange={(value) => setHokeiRank(hokei.hokei_name, value)}
                groupLabel={translator.translate("Självskattning")}
                emptyLabel={translator.translate("Ej bedömd")}
                getLabel={(value) => translator.translate(assessmentLabels[value])}
            />
        );

    return (
        <CollapsibleCard header={cardHead(translator, hokei.hokei_name, options)}
                         footer={footer}
                         focusOnOpen
                         defaultOpen={defaultOpen}
                         onOpenChange={onOpenChange}
                         className={`app-grid-card hokei-card ${className ?? ""}`.trim()}>
            <div style={{ display: "flex", flexDirection: "column", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" }}>
                {hokei.foot_stance && hokei.foot_stance.length > 0 && <FootStancesElement hokei={hokei} showKanji={showKanji} />}
                <HokeiIndividualsElement hokei={hokei} showKanji={showKanji}/>
            </div>
        </CollapsibleCard>
    )
}

interface KamokuCardHeaderProps {
    hokei: HokeiMoment;
    gradeName?: GradeName;
    rank: HokeiRankValue | null;
    showRating?: boolean;
    showKanji: boolean;
}

const KamokuCardHeader = ({ hokei, gradeName, rank, showRating, showKanji }: KamokuCardHeaderProps) => {
    const translator = useContext(TranslatorContext);
    const name = translator.isJapanese ? translator.japanese(hokei.hokei_name) : translator.translate(hokei.hokei_name, { capitalize: true });
    const japaneseName = !translator.isJapanese && showKanji ? translator.japanese(hokei.hokei_name) : null;

    return (
        <div className="kamoku-card-header-content">
            <div className="kamoku-card-name-row">
                <div>
                    <div className="kamoku-card-name">{name}</div>
                    {japaneseName && <div className="kamoku-card-japanese">{japaneseName}</div>}
                </div>
                {showRating && <StarRating value={rank} onChange={value => setHokeiRank(hokei.hokei_name, value)}
                                           groupLabel={translator.translate("Självskattning")} emptyLabel={translator.translate("Ej bedömd")}
                                           getLabel={value => translator.translate(assessmentLabels[value])} />}
            </div>
            {(gradeName || hokei.variations.length > 0 || hokei.technique_group || hokei.kyohan_pages.length > 0) && (
                <div className="kamoku-card-metadata">
                    {gradeName && <span className="kamoku-card-level-tag">{humanGradeName(gradeName)}</span>}
                    {hokei.variations.map(variation => <span key={variation}>{translator.translate(variation)}</span>)}
                    {hokei.technique_group && <span>{translator.translate(hokei.technique_group)}</span>}
                    {hokei.kyohan_pages.length > 0 && <span className="kamoku-card-kyohan">{translator.translate("Kyohan")} {hokei.kyohan_pages.map(page => translator.translate(page)).join(", ")}</span>}
                </div>
            )}
        </div>
    );
};

const DojoCardHeader = ({ hokei }: { hokei: HokeiMoment }) => {
    const translator = useContext(TranslatorContext);
    const name = translator.isJapanese
        ? translator.japanese(hokei.hokei_name)
        : translator.explicitTranslate("en", hokei.hokei_name, { capitalize: true });
    const variationLabel = (variation: string) => translator.isJapanese
        ? translator.translate(variation)
        : translator.explicitTranslate("en", variation);

    return (
        <div className="kamoku-card-header-content dojo-card-header-content">
            <div className="kamoku-card-name">{name}</div>
            {hokei.variations.length > 0 && (
                <div className="kamoku-card-metadata dojo-card-variations">
                    {hokei.variations.map(variation => <span key={variation}>{variationLabel(variation)}</span>)}
                </div>
            )}
        </div>
    );
};

const KamokuCardBody = ({ hokei, showKanji }: { hokei: HokeiMoment; showKanji: boolean }) => {
    const translator = useContext(TranslatorContext);
    const effectiveTheme = useTheme();
    const renderValue = (value?: string, suffix?: React.ReactNode) => value ? (
        <span className="kamoku-card-value">
            <span>{translator.translate(value)}{suffix}</span>
            {!translator.isJapanese && showKanji && <span className="kamoku-card-value-japanese">{translator.japanese(value)}</span>}
        </span>
    ) : <span className="kamoku-card-empty">-</span>;
    const renderRole = (role: HokeiMoment["roles"]["attacker"], Icon: typeof PersonFill, label: string) => (
        <div className="kamoku-card-role-row">
            <Icon className="kamoku-card-role-icon" aria-label={translator.translate(label)} />
            {renderValue(role.stance)}
            {renderValue(role.action, label === "(F)" && hokei.ren_hanko
                ? <i> ({translator.translate("ren hankō")})</i>
                : undefined)}
        </div>
    );

    return (
        <div className="kamoku-card-sequence">
            <div className="kamoku-card-stage kamoku-card-foot-stage">
                <div className="kamoku-card-stage-label">{translator.translate("Uppställning")}</div>
                <div className="kamoku-card-foot-stances">
                    {hokei.foot_stance?.map(stance => (
                        <div className="kamoku-card-foot-stance" key={stance}>
                            <img className="stance-icon" src={`/${stance.toLowerCase().replace(/\s+/g, '_')}${effectiveTheme.effectiveTheme === "dark" ? "_dark" : ""}.png`} alt="" />
                            <span>{renderValue(stance)}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="kamoku-card-technique-table">
                <div className="kamoku-card-column-headings" aria-hidden="true">
                    <span />
                    <span>{translator.translate("Stans")}</span>
                    <span>{translator.translate("Utförande")}</span>
                </div>
                <div className="kamoku-card-role-rows">
                    {renderRole(hokei.roles.attacker, PersonFill, "(A)")}
                    {renderRole(hokei.roles.defender, ShieldFill, "(F)")}
                </div>
            </div>
        </div>
    );
};

const DojoCardBody = ({ hokei }: { hokei: HokeiMoment }) => {
    const translator = useContext(TranslatorContext);
    const effectiveTheme = useTheme();
    const renderRole = (label: string, role: HokeiMoment["roles"]["attacker"]) => (
        <div className="dojo-role">
            <strong>{translator.translate(label)}</strong>
            {role.stance && <div>{translator.translate(role.stance)}</div>}
            {role.action && <div>{translator.translate(role.action)}{label === "(F)" && hokei.ren_hanko && <i> ({translator.translate("ren hankō")})</i>}</div>}
        </div>
    );

    return (
        <div className="dojo-card-body">
            {hokei.foot_stance && hokei.foot_stance.length > 0 && (
                <div className="dojo-foot-images" aria-label={translator.translate("Uppställning")}>
                    {hokei.foot_stance.map(stance => (
                        <img key={stance} className="stance-icon" src={`/${stance.toLowerCase().replace(/\s+/g, '_')}${effectiveTheme.effectiveTheme === "dark" ? "_dark" : ""}.png`} alt="" />
                    ))}
                </div>
            )}
            <div className="dojo-roles">
                {renderRole("(A)", hokei.roles.attacker)}
                {renderRole("(F)", hokei.roles.defender)}
            </div>
        </div>
    );
};

interface CardFooterProps {
    hokei: HokeiMoment;
}

const CardFooter = ({hokei}: CardFooterProps) => {
    const savedNotes = useHokeiNote(hokei.hokei_name);
    // Typing edits a draft; only blur writes it to the store. The draft follows
    // the saved note whenever that changes underneath — the trim applied on
    // save, or an edit arriving from another device over sync.
    const [notes, setNotes] = useState(savedNotes);
    const [lastSavedNotes, setLastSavedNotes] = useState(savedNotes);
    if (lastSavedNotes !== savedNotes) {
        setLastSavedNotes(savedNotes);
        setNotes(savedNotes);
    }
    const [notesAreShown, setNotesAreShown] = useState<boolean>(!!savedNotes);
    const notesRef = useRef<HTMLTextAreaElement>(null);
    const translator = useContext(TranslatorContext);

    const persistNotes = () => {
        let processedNotes = notes;
        if (processedNotes !== null)
            processedNotes = processedNotes.trim();
        setHokeiNote(hokei.hokei_name, processedNotes);
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
        <div className={`p-2 rounded hokei-notes-box${notesAreShown ? " is-open" : ""}`}>
            <div style={{ display: "flex", alignItems: "center", cursor: "pointer", justifyContent: "space-between" }} onClick={() => setNotesAreShown(!notesAreShown)}>
                <div style={{ display: "flex", alignItems: "center" }} >
                    <JournalText className="text-primary" style={{marginRight: "0.5em", display: "block"}}/>
                    {translator.translate(notes ? "Mina anteckningar" : "Anteckningar")}
                </div>
                <div>
                    {notesAreShown && <ChevronDown style={{marginLeft: "0.5rem", display: "block"}}/>}
                    {notesAreShown || <ChevronRight style={{marginLeft: "0.5rem", display: "block"}}/>}
                </div>
            </div>
            <Collapse in={notesAreShown}>
                <div>
                    <Form.Control className="mt-2 mb-2" as="textarea" rows={5} ref={notesRef} value={notes ?? ""}
                                    onChange={e => setNotes(e.target.value)} onBlur={() => persistNotes()}/>
                </div>
            </Collapse>
        </div>
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
    showKanji: boolean;
}

const FootStancesElement = ({ hokei, showKanji }: FootStancesElementProps) => {
    const translator = useContext(TranslatorContext);
    const effectiveTheme = useTheme();

    if (!hokei.foot_stance)
        return null;

    const renderFootStance = (s: string) => {
        const showJapanese = !translator.isJapanese && showKanji;
        return <tbody key={`${hokei.hokei_name}.${s}`}><tr><td>{translator.translate(s)}</td><td rowSpan={showJapanese ? 2 : 1} className="ps-5">{stanceIcon(effectiveTheme.effectiveTheme, s)}</td></tr>
                    {showJapanese && <tr className="japanese-subtitle text-muted"><td>{translator.japanese(s)}</td></tr>}</tbody>;

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
    hokei: HokeiMoment;
    showKanji: boolean;
}

const HokeiIndividualsElement = ({ hokei, showKanji }: HokeiIndividualsElementProps) => {
    const translator = useContext(TranslatorContext);

    return (
        <>
            {renderStances(translator, hokei, showKanji)}
            {renderActions(translator, hokei, showKanji)}
            {renderKyohan(translator, hokei)}
        </>
    )
}

const renderStances = (translator: Translator, hokei: HokeiMoment, showKanji: boolean) => {
    if (!hokei.roles.attacker.stance && !hokei.roles.defender.stance)
        return null;

    const showJapanese = !translator.isJapanese && showKanji;

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
                {hokei.roles.attacker.stance && showJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.roles.attacker.stance)}</td>
                    </tr>
                }
                {hokei.roles.defender.stance &&
                    <tr>
                        <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.roles.defender.stance)}</td>
                    </tr>
                }
                {hokei.roles.defender.stance && showJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.roles.defender.stance)}</td>
                    </tr>
                }
            </tbody>
        </table>
    );
}

const renderActions = (translator: Translator, hokei: HokeiMoment, showKanji: boolean) => {
    if (!hokei.roles.attacker.action && !hokei.roles.defender.action)
        return null;

    const renhanko = hokei.ren_hanko ? <i> ({translator.translate("ren hankō")})</i> : undefined;
    const japaneseRenhanko = hokei.ren_hanko ? <i> ({translator.japanese("ren hankō")})</i> : undefined;
    const showJapanese = !translator.isJapanese && showKanji;

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
                {showJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(攻)</td><td>{translator.japanese(hokei.roles.attacker.action)}</td>
                    </tr>
                }
            </tbody>}
            {hokei.roles.defender.action && <tbody style={{verticalAlign: "top"}}>
                <tr>
                    <td>{translator.translate("(F)")}</td><td>{translator.translate(hokei.roles.defender.action)}{renhanko}</td>
                </tr>
                {showJapanese &&
                    <tr className="japanese-subtitle text-muted">
                        <td>(守)</td><td>{translator.japanese(hokei.roles.defender.action)}{japaneseRenhanko}</td>
                    </tr>
                }
            </tbody>}
        </table>
    );
}

const renderKyohan = (translator: Translator, hokei: HokeiMoment) => {
    if (!hokei.kyohan_pages)
        return null;

    return (
        <table className="hokei-individuals-table mt-3">
            <thead>
                <tr>
                    <th colSpan={2}>
                        {translator.translate("Kyohan")}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>{hokei.kyohan_pages.map(k => translator.translate(k)).join(', ')}</td>
                </tr>
            </tbody>
        </table>
    )
}

export default HokeiCard;
