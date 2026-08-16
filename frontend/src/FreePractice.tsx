import { Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Form } from "react-bootstrap";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Book, CardHeading, ChevronDown, ChevronRight, Collection, ExclamationTriangle, GripVertical, ListUl, Pencil, People, PlayCircle, Plus, Search, Trash, X } from "react-bootstrap-icons";
import type { GradeName, GradePlan, HokeiMoment, TanenKihonHokei } from "./data";
import { findGradePlan, getHokeiMoments, getStandardMoments } from "./data";
import Grid, { type GridItem } from "./components/Grid";
import HokeiCard from "./components/HokeiCard";
import InlineNoteEditor from "./components/InlineNoteEditor";
import KumiEmbuSequenceList, { type KumiEmbuTechniqueLink } from "./components/KumiEmbuSequenceList";
import VideoLink from "./components/VideoLink";
import List from "./List";
import { TranslatorContext } from "./i18n";
import { gradeLabel, matchesString } from "./strings";
import { compareGrades, compareGradeThenWeek } from "./utilities/level";
import {
    loadExperimentalEmbuDraft,
    type EmbuDraft,
    type EmbuDraftHokei,
    type EmbuDraftSequence,
} from "./persistence/experimental-embu-draft";
import tanenKihonHokeiData from "./assets/tanen_kihon_hokei.json";
import { gradingManuals } from "./grading-exam-information";
import type { PracticeArea } from "./practice-area";
import {
    hidariMigiMaeTechniques,
    idoKoboTechniques,
    kaisokuAttacks,
    kaisokuDefences,
    koboTechniques,
    ukeCounterTechniques,
    type KihonPracticeItem,
} from "./kihon-practice";
import "./FreePractice.css";

interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    activeArea: PracticeArea | null;
    onAreaChange: (area: PracticeArea | null) => void;
    onBack: () => void;
    dojoMode: boolean;
}

interface AreaDefinition {
    key: PracticeArea;
    title: string;
    description: string;
    icon: ReactNode;
}

const areaDefinitions: AreaDefinition[] = [
    { key: "kihon", title: "Kihon", description: "Grundträning och återkommande övningar.", icon: <Book /> },
    { key: "hokei", title: "Hokei", description: "Sök och välj tekniker att träna.", icon: <ListUl /> },
    { key: "tanen-sotai", title: "Tan'en och sōtai", description: "Träna befintliga former med videostöd.", icon: <Collection /> },
    { key: "randori", title: "Randori", description: "Välj bland randori-teman från kamoku.", icon: <People /> },
    { key: "embu", title: "Embu och kumi-embu", description: "Bygg en egen embu eller träna en färdig sekvens.", icon: <CardHeading /> },
];

const tanenKihonHokei = tanenKihonHokeiData as TanenKihonHokei[];

const FreePractice = (props: Props) => {
    const { activeArea, onAreaChange, onBack, dojoMode } = props;
    const translator = useContext(TranslatorContext);
    const [visitedAreas, setVisitedAreas] = useState<Set<PracticeArea>>(() =>
        new Set(activeArea ? [activeArea] : []));
    const [activeEmbuView, setActiveEmbuView] = useState<EmbuAreaView | null>(null);
    const scrollPositions = useRef<Record<string, number>>({ overview: 0 });
    const pendingScrollTarget = useRef<string | null>(null);
    const overviewHeadingRef = useRef<HTMLHeadingElement>(null);
    const areaHeadingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        const target = pendingScrollTarget.current;
        if (!target) return;
        pendingScrollTarget.current = null;

        window.requestAnimationFrame(() => {
            window.scrollTo({ top: scrollPositions.current[target] ?? 0, behavior: "auto" });
            if (activeArea) areaHeadingRef.current?.focus({ preventScroll: true });
            else overviewHeadingRef.current?.focus({ preventScroll: true });
        });
    }, [activeArea]);

    const selectArea = (nextArea: PracticeArea | null) => {
        const currentKey = activeArea ?? "overview";
        const nextKey = nextArea ?? "overview";
        scrollPositions.current[currentKey] = window.scrollY;
        pendingScrollTarget.current = nextKey;
        if (nextArea) {
            setVisitedAreas(current => current.has(nextArea) ? current : new Set([...current, nextArea]));
        }
        setActiveEmbuView(null);
        onAreaChange(nextArea);
    };

    const returnToOverview = () => {
        if (activeArea === "embu" && activeEmbuView !== null) {
            setActiveEmbuView(null);
            return;
        }
        if (activeArea) scrollPositions.current[activeArea] = window.scrollY;
        pendingScrollTarget.current = "overview";
        setActiveEmbuView(null);
        onBack();
    };

    const items: GridItem[] = areaDefinitions.map(area => ({
        key: area.key,
        title: translator.translate(area.title),
        subtitle: translator.translate(area.description),
        icon: area.icon,
        onSelect: () => selectArea(area.key),
    }));
    const activeDefinition = activeArea
        ? areaDefinitions.find(area => area.key === activeArea) ?? null
        : null;

    return (
        <>
            <section className="free-practice-overview" hidden={activeArea !== null}>
                <header className="free-practice-intro">
                    <h1 className="app-view-heading" ref={overviewHeadingRef} tabIndex={-1}>{translator.translate("Fri träning")}</h1>
                    <p className="app-intro-copy">{translator.translate("Välj ett träningsområde. Du kan byta när du vill.")}</p>
                </header>
                <Grid items={items} className="free-practice-grid" />
            </section>
            <section className="free-practice-area" hidden={activeArea === null}>
                <button type="button" className="free-practice-back" onClick={returnToOverview}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate(activeArea === "embu" && activeEmbuView !== null
                        ? "Embu och kumi-embu"
                        : "Alla träningsområden")}</span>
                </button>
                {activeDefinition && (
                    <header className="free-practice-area-header">
                        <div>
                            <h1 className="app-view-heading" ref={areaHeadingRef} tabIndex={-1}>
                                {translator.translate(activeArea === "embu" ? "Embu" : activeDefinition.title)}
                            </h1>
                            {!(dojoMode && activeArea !== null) && (
                                <p className="app-intro-copy">{translator.translate(activeDefinition.description)}</p>
                            )}
                        </div>
                    </header>
                )}

            {visitedAreas.has("kihon") && (
                <div hidden={activeArea !== "kihon"}>
                    <KihonArea {...props} dojoMode={dojoMode} />
                </div>
            )}
            {visitedAreas.has("hokei") && (
                <div
                    className={`free-practice-hokei${dojoMode ? " dojo-readable-hokei" : ""}`}
                    hidden={activeArea !== "hokei"}
                >
                    <List
                        grade={findGradePlan(props.allGradePlans, props.myGrade)}
                        allGradePlans={props.allGradePlans}
                        dojoMode={dojoMode}
                    />
                </div>
            )}
            {visitedAreas.has("tanen-sotai") && (
                <div hidden={activeArea !== "tanen-sotai"}>
                    <TanenSotaiArea dojoMode={dojoMode} />
                </div>
            )}
            {visitedAreas.has("randori") && (
                <div hidden={activeArea !== "randori"}>
                    <RandoriArea allGradePlans={props.allGradePlans} dojoMode={dojoMode} />
                </div>
            )}
            {visitedAreas.has("embu") && (
                <div hidden={activeArea !== "embu"}>
                    <EmbuArea
                        myGrade={props.myGrade}
                        allGradePlans={props.allGradePlans}
                        dojoMode={dojoMode}
                        activeView={activeEmbuView}
                        onViewChange={setActiveEmbuView}
                    />
                </div>
            )}
            </section>
        </>
    );
};

type KihonAreaProps = Pick<Props, "myGrade" | "dojoMode">;

const KihonArea = ({ myGrade, dojoMode }: KihonAreaProps) => {
    const translator = useContext(TranslatorContext);
    const selectedGrade = myGrade;

    return (
        <div className={`free-practice-content kihon-practice-proposal${dojoMode ? " is-dojo-mode" : ""}`}>
            {!dojoMode && (
                <p className="kihon-design-note">
                    {translator.translate("Den här sidan är fortfarande under utformning och kan ändras när som helst.")}
                </p>
            )}
            <section className="free-practice-section kihon-practice-group">
                <h3 className="app-section-heading">{translator.translate("Kaisoku dachi / Byakuren chūdan gamae")}</h3>
                <div className="kihon-practice-columns">
                    <KihonTechniqueList title={translator.translate("Angrepp")} items={kaisokuAttacks} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                    <KihonTechniqueList title={translator.translate("Försvar")} items={kaisokuDefences} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                </div>
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3 className="app-section-heading">{translator.translate("Hidari/migi mae")}</h3>
                <KihonTechniqueList items={hidariMigiMaeTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3 className="app-section-heading">{translator.translate("Uke och kontring")}</h3>
                <KihonTechniqueList items={ukeCounterTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3 className="app-section-heading">{translator.translate("Kōbōgi och idō kōbōgi")}</h3>
                <div className="kihon-practice-columns">
                    <KihonTechniqueList title="Kōbōgi" items={koboTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                    <KihonTechniqueList title="Idō kōbōgi" items={idoKoboTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                </div>
            </section>
        </div>
    );
};

interface KihonTechniqueListProps {
    title?: string;
    items: KihonPracticeItem[];
    selectedGrade: GradeName;
    dojoMode: boolean;
}

const KihonTechniqueList = ({ title, items, selectedGrade, dojoMode }: KihonTechniqueListProps) => {
    const translator = useContext(TranslatorContext);
    const visibleItems = items.filter(item => compareGrades(item.introducedAt, selectedGrade) <= 0);

    return (
        <section className="kihon-technique-list">
            {title && <h4>{translator.translate(title)}</h4>}
            <ul className="free-practice-item-list">
                {visibleItems.map(item => (
                    <li key={`${item.introducedAt}.${item.name}`}>
                        <PracticeTerm value={item.name} dojoMode={dojoMode} />
                        {!dojoMode && (
                            <span className="free-practice-item-grade">
                                {gradeLabel(item.introducedAt, translator, false)}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

const TanenSotaiArea = ({ dojoMode }: { dojoMode: boolean }) => {
    const translator = useContext(TranslatorContext);
    const tanen = tanenKihonHokei.filter(entry => !entry.hokei_name.includes("(sōtai)"));
    const sotai = tanenKihonHokei.filter(entry => entry.hokei_name.includes("(sōtai)"));

    return (
        <div className={`free-practice-content free-practice-form-groups${dojoMode ? " is-dojo-mode" : ""}`}>
            <PracticeFormMode title={translator.translate("Tan'en")} entries={tanen} dojoMode={dojoMode} />
            <PracticeFormMode title={translator.translate("Sōtai")} entries={sotai} dojoMode={dojoMode} />
        </div>
    );
};

interface PracticeFormFamily {
    title: string;
    entries: TanenKihonHokei[];
}

const groupPracticeForms = (entries: TanenKihonHokei[]): PracticeFormFamily[] => {
    const definitions = [
        { title: "Tenchi ken", prefix: "tenchi ken" },
        { title: "Giwa ken", prefix: "giwa ken" },
        { title: "Ryūō ken", prefix: "ryūō ken" },
    ];
    const groups = definitions.map(definition => ({
        title: definition.title,
        entries: entries.filter(entry => entry.hokei_name.startsWith(definition.prefix)),
    })).filter(group => group.entries.length > 0);
    const groupedEntries = new Set(groups.flatMap(group => group.entries));
    const otherEntries = entries.filter(entry => !groupedEntries.has(entry));

    return otherEntries.length > 0
        ? [...groups, { title: "Andra former", entries: otherEntries }]
        : groups;
};

const PracticeFormMode = ({ title, entries, dojoMode }: { title: string; entries: TanenKihonHokei[]; dojoMode: boolean }) => (
    <section className="free-practice-section practice-form-mode">
        <h3 className="app-section-heading">{title}</h3>
        <div className="practice-form-family-list">
            {groupPracticeForms(entries).map(group => (
                <PracticeFormGroup key={group.title} title={group.title} entries={group.entries} dojoMode={dojoMode} />
            ))}
        </div>
    </section>
);

const PracticeFormGroup = ({ title, entries, dojoMode }: { title: string; entries: TanenKihonHokei[]; dojoMode: boolean }) => {
    const translator = useContext(TranslatorContext);

    return (
        <section className="practice-form-family">
            <h4>{translator.translate(title)}</h4>
            <ul className="free-practice-item-list">
                {entries.map(entry => (
                    <li key={entry.hokei_name}>
                        <PracticeTerm value={entry.hokei_name} dojoMode={dojoMode} />
                        {(entry.videos ?? []).map(video => (
                            <VideoLink key={video.url} video={video} className="mt-2" />
                        ))}
                    </li>
                ))}
            </ul>
        </section>
    );
};

interface RandoriTheme {
    type: string;
    restriction: string;
    introducedAt: GradeName;
}

const RandoriArea = ({ allGradePlans, dojoMode }: Pick<Props, "allGradePlans" | "dojoMode">) => {
    const translator = useContext(TranslatorContext);
    const { gohoThemes, juhoThemes, otherThemes, unrestrictedFrom } = useMemo(() => {
        const entries = allGradePlans.flatMap(plan => plan.weeks.flatMap(week =>
            getStandardMoments(week)
                .filter(moment => moment.content.includes("randori"))
                .map(moment => ({ moment, grade: plan.grade, week: week.week }))));
        const sortedEntries = entries.sort((a, b) =>
            compareGrades(a.grade, b.grade) || a.week - b.week);
        const detailedThemes = sortedEntries.flatMap(({ moment, grade }) =>
            moment.randori && moment.restrictions
                ? [{ type: moment.randori, restriction: moment.restrictions, introducedAt: grade }]
                : []);
        const uniqueThemes = [...detailedThemes.reduce((themes, theme) => {
            const key = `${theme.type}|${theme.restriction}`;
            if (!themes.has(key)) themes.set(key, theme);
            return themes;
        }, new Map<string, RandoriTheme>()).values()];
        const unrestrictedEntry = sortedEntries.find(({ moment }) => !moment.randori && !moment.restrictions);

        return {
            gohoThemes: uniqueThemes.filter(theme => theme.type === "gōhō"),
            juhoThemes: uniqueThemes.filter(theme => theme.type === "jūhō"),
            otherThemes: uniqueThemes.filter(theme => theme.type !== "gōhō" && theme.type !== "jūhō"),
            unrestrictedFrom: unrestrictedEntry?.grade,
        };
    }, [allGradePlans]);

    return (
        <div className={`free-practice-content randori-practice-groups${dojoMode ? " is-dojo-mode" : ""}`}>
            <RandoriThemeGroup title="gōhō" themes={gohoThemes} dojoMode={dojoMode} />
            <RandoriThemeGroup title="jūhō" themes={juhoThemes} dojoMode={dojoMode} />
            {otherThemes.length > 0 && (
                <RandoriThemeGroup title={translator.translate("Övrigt")} themes={otherThemes} dojoMode={dojoMode} />
            )}
            {unrestrictedFrom && !dojoMode && (
                <p className="free-practice-source-note">
                    {translator.translate("Från {0} anger Kamokuhyo randori utan ett mer detaljerat delsteg.", {
                        params: [gradeLabel(unrestrictedFrom, translator, false)],
                    })}
                </p>
            )}
        </div>
    );
};

const RandoriThemeGroup = ({ title, themes, dojoMode }: { title: string; themes: RandoriTheme[]; dojoMode: boolean }) => {
    const translator = useContext(TranslatorContext);
    if (themes.length === 0) return null;

    return (
        <section className="free-practice-section randori-theme-group">
            <h3 className="app-section-heading"><PracticeTerm value={title} dojoMode={dojoMode} /></h3>
            <ul className="free-practice-item-list randori-theme-list">
                {themes.map(theme => (
                    <li key={`${theme.type}|${theme.restriction}`}>
                        <PracticeTerm value={theme.restriction} dojoMode={dojoMode} />
                        {!dojoMode && (
                            <span className="free-practice-item-grade">
                                {gradeLabel(theme.introducedAt, translator, false)}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};


interface EmbuTechnique {
    grade: GradeName;
    week: number;
    momentIndex: number;
    hokei: HokeiMoment;
}

interface EmbuPreview {
    technique: EmbuTechnique;
    requestId: number;
}

interface EmbuMoveMenu {
    sequenceId: string;
    hokeiId: string;
}

interface EmbuDragCandidate extends EmbuMoveMenu {
    pointerId: number;
    startX: number;
    startY: number;
    hokeiName: string;
}

interface EmbuHokeiDrag extends EmbuMoveMenu {
    hokeiName: string;
    clientX: number;
    clientY: number;
}

interface EmbuDropTarget {
    sequenceId: string;
    index: number;
}

const MAX_EMBU_SEQUENCES = 6;

let embuItemId = 0;
const createEmbuItemId = (prefix: "sequence" | "hokei") => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    embuItemId += 1;
    return `embu-${prefix}-${Date.now().toString(36)}-${embuItemId}`;
};

const embuTechniqueKey = (technique: Pick<EmbuTechnique, "grade" | "week" | "momentIndex">) =>
    `${technique.grade}|${technique.week}|${technique.momentIndex}`;

const fillEmbuSequenceSlots = (draft: EmbuDraft): EmbuDraft => {
    if (draft.sequences.length >= MAX_EMBU_SEQUENCES) return draft;

    const sequences = [...draft.sequences];
    while (sequences.length < MAX_EMBU_SEQUENCES) {
        sequences.push({ id: createEmbuItemId("sequence"), hokeis: [] });
    }
    return { ...draft, sequences };
};

type EmbuAreaView = "builder" | "practice" | "kumi";

interface EmbuAreaProps extends Pick<Props, "myGrade" | "allGradePlans" | "dojoMode"> {
    activeView: EmbuAreaView | null;
    onViewChange: (view: EmbuAreaView | null) => void;
}

const EmbuArea = ({ myGrade, allGradePlans, dojoMode, activeView, onViewChange }: EmbuAreaProps) => {
    const translator = useContext(TranslatorContext);
    const draftData = useMemo(() => loadExperimentalEmbuDraft(), []);
    const [draft, setDraft] = useState<EmbuDraft>(() => fillEmbuSequenceSlots(draftData.data));
    const [pickerTarget, setPickerTarget] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [activeSuggestion, setActiveSuggestion] = useState(0);
    const [preview, setPreview] = useState<EmbuPreview | null>(null);
    const [practiceSequenceIndex, setPracticeSequenceIndex] = useState(0);
    const [expandedSequenceId, setExpandedSequenceId] = useState<string | null>(null);
    const [moveMenu, setMoveMenu] = useState<EmbuMoveMenu | null>(null);
    const [draggedHokei, setDraggedHokei] = useState<EmbuHokeiDrag | null>(null);
    const [dropTarget, setDropTarget] = useState<EmbuDropTarget | null>(null);
    const previewRequestId = useRef(0);
    const dragCandidateRef = useRef<EmbuDragCandidate | null>(null);
    const draggedHokeiRef = useRef<EmbuHokeiDrag | null>(null);
    const dropTargetRef = useRef<EmbuDropTarget | null>(null);
    const techniqueSearchRef = useRef<HTMLInputElement>(null);
    const techniques = useMemo(() => allGradePlans.flatMap(plan => plan.weeks.flatMap(week =>
        getHokeiMoments(week).map((hokei, momentIndex) => ({
            grade: plan.grade,
            week: week.week,
            momentIndex,
            hokei,
        }))
    )).sort(compareGradeThenWeek), [allGradePlans]);
    const techniqueLookup = useMemo(() => new Map(
        techniques.map(technique => [embuTechniqueKey(technique), technique])
    ), [techniques]);
    const suggestions = useMemo(() => {
        const needle = query.trim();
        if (!needle) return [];

        return techniques.filter(technique => [
            technique.hokei.hokei_name,
            translator.translate(technique.hokei.hokei_name),
            translator.japanese(technique.hokei.hokei_name),
            technique.hokei.technique_group,
            ...technique.hokei.variations,
        ].some(value => matchesString(value ?? "", needle))).slice(0, 8);
    }, [query, techniques, translator]);
    const sequences = useMemo(() => allGradePlans.flatMap(plan => {
        const sequence = gradingManuals[plan.grade]?.sections
            ?.flatMap(section => section.items ?? [])
            .find(item => item.term?.romaji === "kumi embu");
        return sequence ? [{ grade: plan.grade, sequence }] : [];
    }).sort((a, b) => compareGrades(a.grade, b.grade)), [allGradePlans]);
    const selected = sequences.find(entry => entry.grade === myGrade) ?? sequences[0];

    useEffect(() => draftData.registerListener(nextDraft => setDraft(fillEmbuSequenceSlots(nextDraft))), [draftData]);

    const saveDraft = (nextDraft: EmbuDraft) => {
        setDraft(nextDraft);
        draftData.save(nextDraft);
    };

    const openPicker = (target: string) => {
        setPickerTarget(target);
        setExpandedSequenceId(null);
        setMoveMenu(null);
        setQuery("");
        setActiveSuggestion(0);
        window.requestAnimationFrame(() => techniqueSearchRef.current?.focus());
    };

    const closePicker = () => {
        setPickerTarget(null);
        setQuery("");
        setActiveSuggestion(0);
    };

    const addHokei = (technique: EmbuTechnique) => {
        if (pickerTarget === null) return;

        const hokei: EmbuDraftHokei = {
            id: createEmbuItemId("hokei"),
            hokeiName: technique.hokei.hokei_name,
            grade: technique.grade,
            week: technique.week,
            momentIndex: technique.momentIndex,
            comment: draft.pendingComment ?? "",
        };

        saveDraft({
            sequences: draft.sequences.map(sequence => sequence.id === pickerTarget
                ? { ...sequence, hokeis: [...sequence.hokeis, hokei] }
                : sequence),
        });

        setPickerTarget(null);
        setQuery("");
        setActiveSuggestion(0);
    };

    const updateSequence = (id: string, changes: Partial<EmbuDraftSequence>) => {
        saveDraft({
            ...draft,
            sequences: draft.sequences.map(sequence => sequence.id === id ? { ...sequence, ...changes } : sequence),
        });
    };

    const moveHokeiTo = (sourceSequenceId: string, hokeiId: string, targetSequenceId: string, targetIndex: number) => {
        const sourceSequence = draft.sequences.find(sequence => sequence.id === sourceSequenceId);
        const hokei = sourceSequence?.hokeis.find(candidate => candidate.id === hokeiId);
        if (!hokei || !draft.sequences.some(sequence => sequence.id === targetSequenceId)) return;

        const sequencesWithoutHokei = draft.sequences.map(sequence => sequence.id === sourceSequenceId
            ? { ...sequence, hokeis: sequence.hokeis.filter(candidate => candidate.id !== hokeiId) }
            : sequence);
        const sequences = sequencesWithoutHokei.map(sequence => {
            if (sequence.id !== targetSequenceId) return sequence;
            const index = Math.max(0, Math.min(targetIndex, sequence.hokeis.length));
            return {
                ...sequence,
                hokeis: [...sequence.hokeis.slice(0, index), hokei, ...sequence.hokeis.slice(index)],
            };
        });
        saveDraft({ ...draft, sequences });
    };

    const moveHokei = (sequenceId: string, hokeiIndex: number, direction: -1 | 1) => {
        const sequence = draft.sequences.find(candidate => candidate.id === sequenceId);
        if (!sequence) return;
        const hokei = sequence.hokeis[hokeiIndex];
        const destination = hokeiIndex + direction;
        if (!hokei || destination < 0 || destination >= sequence.hokeis.length) return;
        moveHokeiTo(sequenceId, hokei.id, sequenceId, destination);
    };

    const moveHokeiToSequence = (sourceSequenceId: string, hokeiId: string, targetSequenceId: string) => {
        const targetSequence = draft.sequences.find(sequence => sequence.id === targetSequenceId);
        if (!targetSequence) return;
        moveHokeiTo(sourceSequenceId, hokeiId, targetSequenceId, targetSequence.hokeis.length);
    };

    const locateHokeiDropTarget = (clientX: number, clientY: number, draggedHokeiId: string) => {
        const sequenceElement = document.elementFromPoint(clientX, clientY)
            ?.closest<HTMLElement>("[data-embu-sequence-id]");
        const sequenceId = sequenceElement?.dataset.embuSequenceId;
        if (!sequenceElement || !sequenceId) return null;

        const hokeiRows = [...sequenceElement.querySelectorAll<HTMLElement>("[data-embu-hokei-id]")]
            .filter(row => row.dataset.embuHokeiId !== draggedHokeiId);
        const index = hokeiRows.findIndex(row => clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
        return { sequenceId, index: index < 0 ? hokeiRows.length : index };
    };

    const startHokeiPointer = (
        event: React.PointerEvent<HTMLButtonElement>,
        sequenceId: string,
        hokei: EmbuDraftHokei,
    ) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragCandidateRef.current = {
            pointerId: event.pointerId,
            sequenceId,
            hokeiId: hokei.id,
            hokeiName: hokei.hokeiName,
            startX: event.clientX,
            startY: event.clientY,
        };
    };

    const dragHokeiPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
        const candidate = dragCandidateRef.current;
        if (!candidate || candidate.pointerId !== event.pointerId) return;

        const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);
        if (!draggedHokeiRef.current && distance < 7) return;

        event.preventDefault();
        const drag = {
            sequenceId: candidate.sequenceId,
            hokeiId: candidate.hokeiId,
            hokeiName: candidate.hokeiName,
            clientX: event.clientX,
            clientY: event.clientY,
        };
        const target = locateHokeiDropTarget(event.clientX, event.clientY, candidate.hokeiId);
        draggedHokeiRef.current = drag;
        dropTargetRef.current = target;
        setDraggedHokei(drag);
        setDropTarget(target);
        setMoveMenu(null);
    };

    const finishHokeiPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
        const candidate = dragCandidateRef.current;
        const drag = draggedHokeiRef.current;
        const target = dropTargetRef.current;
        if (!candidate || candidate.pointerId !== event.pointerId) return;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!cancelled && drag && target) {
            moveHokeiTo(drag.sequenceId, drag.hokeiId, target.sequenceId, target.index);
        } else if (!cancelled && !drag) {
            setMoveMenu({ sequenceId: candidate.sequenceId, hokeiId: candidate.hokeiId });
        }

        dragCandidateRef.current = null;
        draggedHokeiRef.current = null;
        dropTargetRef.current = null;
        setDraggedHokei(null);
        setDropTarget(null);
    };

    const cancelHokeiPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
        finishHokeiPointer(event, true);
    };

    const removeHokei = (sequenceId: string, hokeiId: string) => {
        const sequence = draft.sequences.find(candidate => candidate.id === sequenceId);
        if (!sequence) return;
        const removedHokei = sequence.hokeis.find(hokei => hokei.id === hokeiId);
        const remainingHokeis = sequence.hokeis.filter(hokei => hokei.id !== hokeiId);
        const sequences = draft.sequences.map(candidate => candidate.id === sequenceId
            ? { ...candidate, hokeis: remainingHokeis }
            : candidate);

        saveDraft({ ...draft, sequences });
        if (pickerTarget === sequenceId) setPickerTarget(null);
        if (moveMenu?.hokeiId === hokeiId) setMoveMenu(null);
        if (removedHokei) {
            setPreview(current => current
                && embuTechniqueKey(removedHokei) === embuTechniqueKey(current.technique) ? null : current);
        }
    };

    const showTechnique = (technique: EmbuTechnique) => {
        previewRequestId.current += 1;
        setPreview({ technique, requestId: previewRequestId.current });
    };

    const selectView = (view: EmbuAreaView | null) => {
        setPreview(null);
        if (view === "practice") setPracticeSequenceIndex(0);
        onViewChange(view);
    };

    const saveHokeiComment = (sequenceId: string, hokeiId: string, comment: string) => {
        const sequence = draft.sequences.find(candidate => candidate.id === sequenceId);
        if (!sequence) return;

        updateSequence(sequenceId, {
            hokeis: sequence.hokeis.map(hokei => hokei.id === hokeiId
                ? { ...hokei, comment }
                : hokei),
        });
    };

    const chooseActiveSuggestion = () => {
        const suggestion = suggestions[activeSuggestion];
        if (suggestion) addHokei(suggestion);
    };

    const pickerSequenceIndex = draft.sequences.findIndex(sequence => sequence.id === pickerTarget);
    const practiceSequences = draft.sequences.flatMap((sequence, sequenceIndex) =>
        sequence.hokeis.length > 0 ? [{ sequence, sequenceIndex }] : []);
    const visiblePracticeSequenceIndex = Math.min(practiceSequenceIndex, Math.max(0, practiceSequences.length - 1));
    const practiceSequenceEntry = practiceSequences[visiblePracticeSequenceIndex];
    const practiceSequence = practiceSequenceEntry?.sequence;
    const hasDraftHokeis = practiceSequences.length > 0;
    const kumiEmbuTechniques: KumiEmbuTechniqueLink[] = techniques.map(technique => ({
        key: embuTechniqueKey(technique),
        hokei: technique.hokei,
        onSelect: () => showTechnique(technique),
    }));

    const techniquePicker = pickerTarget !== null && pickerSequenceIndex >= 0 ? (
        <div className="embu-technique-picker">
            <div className="embu-picker-heading">
                <Form.Label htmlFor="embu-technique-search">
                    {translator.translate("Välj hokei till sekvens {0}", { params: [String(pickerSequenceIndex + 1)] })}
                </Form.Label>
                {draft.sequences.length > 0 && (
                    <button type="button" className="embu-text-button" onClick={closePicker}>
                        {translator.translate("Avbryt")}
                    </button>
                )}
            </div>
            <div className="embu-search-field">
                <Search aria-hidden="true" />
                <Form.Control
                    id="embu-technique-search"
                    ref={techniqueSearchRef}
                    type="search"
                    role="combobox"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="embu-technique-suggestions"
                    aria-activedescendant={suggestions.length > 0 ? `embu-suggestion-${activeSuggestion}` : undefined}
                    value={query}
                    placeholder={translator.translate("Sök, till exempel gyaku gote")}
                    onChange={event => {
                        setQuery(event.target.value);
                        setActiveSuggestion(0);
                    }}
                    onKeyDown={event => {
                        if (event.key === "ArrowDown" && suggestions.length > 0) {
                            event.preventDefault();
                            setActiveSuggestion(index => (index + 1) % suggestions.length);
                        } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                            event.preventDefault();
                            setActiveSuggestion(index => (index - 1 + suggestions.length) % suggestions.length);
                        } else if (event.key === "Enter" && suggestions.length > 0) {
                            event.preventDefault();
                            chooseActiveSuggestion();
                        } else if (event.key === "Escape") {
                            if (query) setQuery("");
                            else closePicker();
                        }
                    }}
                />
            </div>
            {suggestions.length > 0 && (
                <div className="embu-suggestions" id="embu-technique-suggestions" role="listbox">
                    {suggestions.map((technique, index) => (
                        <button
                            key={embuTechniqueKey(technique)}
                            id={`embu-suggestion-${index}`}
                            type="button"
                            role="option"
                            aria-selected={index === activeSuggestion}
                            className={index === activeSuggestion ? "is-active" : undefined}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => addHokei(technique)}
                        >
                            <PracticeTerm value={technique.hokei.hokei_name} dojoMode={dojoMode} />
                            <span>{gradeLabel(technique.grade, translator, false)} · {translator.translate("vecka {0}", { params: [String(technique.week)] })}</span>
                        </button>
                    ))}
                </div>
            )}
            {query.trim() && suggestions.length === 0 && (
                <p className="embu-no-results">{translator.translate("Ingen teknik hittades.")}</p>
            )}
        </div>
    ) : null;

    if (activeView === null) {
        const choices: GridItem[] = [
            {
                key: "build-embu",
                title: translator.translate("Skapa embu"),
                icon: <CardHeading />,
                onSelect: () => selectView("builder"),
            },
            {
                key: "practice-kumi-embu",
                title: translator.translate("Träna kumi-embu"),
                icon: <People />,
                onSelect: () => selectView("kumi"),
            },
        ];
        if (hasDraftHokeis) {
            choices.splice(1, 0, {
                key: "practice-embu",
                title: translator.translate("Träna embun"),
                icon: <PlayCircle />,
                onSelect: () => selectView("practice"),
            });
        }

        return (
            <div className={`free-practice-content embu-choice-page${dojoMode ? " is-dojo-mode" : ""}`}>
                <Grid items={choices} className="free-practice-grid embu-choice-grid" />
            </div>
        );
    }

    return (
        <div className={`free-practice-content embu-detail-view${dojoMode || activeView === "practice" ? " dojo-readable-hokei" : ""}`}>
            {activeView === "builder" && (
            <section className="free-practice-section embu-builder">
                <div className="embu-builder-heading">
                    <h3 className="app-section-heading">{translator.translate("Bygg embu")}</h3>
                    <span className="embu-experimental-label">
                        <ExclamationTriangle aria-hidden="true" />
                        {translator.translate("Experimentell")}
                    </span>
                </div>
                <p className="embu-experimental-note">
                    {translator.translate("Det här är en prototyp. Utkastet sparas bara på den här enheten och kommer att försvinna när experimentfasen avslutas.")}
                </p>

                <ol className="embu-draft-sequences">
                    {draft.sequences.map((sequence, sequenceIndex) => {
                        const isExpanded = expandedSequenceId === sequence.id;
                        const isDropSequence = dropTarget?.sequenceId === sequence.id;
                        const remainingHokeiCount = sequence.hokeis.filter(hokei => hokei.id !== draggedHokei?.hokeiId).length;
                        return (
                            <li
                                key={sequence.id}
                                className={`embu-sequence${isExpanded ? " is-expanded" : ""}${isDropSequence ? " is-drop-target" : ""}`}
                                data-embu-sequence-id={sequence.id}
                            >
                                <div className="embu-sequence-summary">
                                    {sequence.hokeis.length > 0 ? (
                                        <button
                                            type="button"
                                            className="embu-sequence-toggle"
                                            aria-expanded={isExpanded}
                                            aria-label={translator.translate(isExpanded ? "Dölj detaljer för sekvens {0}" : "Visa detaljer för sekvens {0}", { params: [String(sequenceIndex + 1)] })}
                                            onClick={() => {
                                                setExpandedSequenceId(isExpanded ? null : sequence.id);
                                                setPickerTarget(null);
                                                setMoveMenu(null);
                                            }}
                                        >
                                            <span>{sequenceIndex + 1}.</span>
                                            {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                                        </button>
                                    ) : (
                                        <span className="embu-sequence-number">
                                            <span aria-hidden="true">{sequenceIndex + 1}.</span>
                                            <span className="visually-hidden">
                                                {translator.translate("Sekvens {0}", { params: [String(sequenceIndex + 1)] })}
                                            </span>
                                        </span>
                                    )}

                                    <ul className="embu-sequence-hokeis">
                                        {sequence.hokeis.map((hokei, hokeiIndex) => {
                                            const technique = techniqueLookup.get(embuTechniqueKey(hokei))
                                                ?? techniques.find(candidate => candidate.hokei.hokei_name === hokei.hokeiName);
                                            const isDragged = draggedHokei?.hokeiId === hokei.id;
                                            const filteredIndex = sequence.hokeis
                                                .slice(0, hokeiIndex)
                                                .filter(candidate => candidate.id !== draggedHokei?.hokeiId).length;
                                            const showIndicator = !isDragged && isDropSequence && dropTarget?.index === filteredIndex;
                                            const menuIsOpen = moveMenu?.sequenceId === sequence.id && moveMenu.hokeiId === hokei.id;
                                            return (
                                                <Fragment key={hokei.id}>
                                                    {showIndicator && <li className="embu-drop-indicator" aria-hidden="true" />}
                                                    <li
                                                        className={`embu-compact-hokei${isDragged ? " is-dragging-placeholder" : ""}`}
                                                        data-embu-hokei-id={hokei.id}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="embu-hokei-drag-handle"
                                                            aria-label={translator.translate("Flytta {0}", { params: [hokei.hokeiName] })}
                                                            aria-expanded={menuIsOpen}
                                                            onKeyDown={event => {
                                                                if (event.key !== "Enter" && event.key !== " ") return;
                                                                event.preventDefault();
                                                                setMoveMenu(menuIsOpen ? null : { sequenceId: sequence.id, hokeiId: hokei.id });
                                                            }}
                                                            onPointerDown={event => startHokeiPointer(event, sequence.id, hokei)}
                                                            onPointerMove={dragHokeiPointer}
                                                            onPointerUp={event => finishHokeiPointer(event)}
                                                            onPointerCancel={cancelHokeiPointer}
                                                        >
                                                            <GripVertical aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="embu-step-technique"
                                                            disabled={!technique}
                                                            aria-label={translator.translate("Visa teknik {0}", { params: [hokei.hokeiName] })}
                                                            onClick={() => technique && showTechnique(technique)}
                                                        >
                                                            <PracticeTerm value={hokei.hokeiName} dojoMode={dojoMode} />
                                                        </button>
                                                        {hokei.comment && (
                                                            <span className="embu-compact-note" title={translator.translate("Har kommentar")}>
                                                                <Pencil aria-hidden="true" />
                                                                <span className="visually-hidden">{translator.translate("Har kommentar")}</span>
                                                            </span>
                                                        )}
                                                        {menuIsOpen && (
                                                            <div className="embu-move-menu" role="group" aria-label={translator.translate("Flytta {0}", { params: [hokei.hokeiName] })}>
                                                                <div className="embu-move-menu-heading">
                                                                    <span>{translator.translate(hokei.hokeiName)}</span>
                                                                    <button type="button" aria-label={translator.translate("Stäng")} onClick={() => setMoveMenu(null)}>
                                                                        <X aria-hidden="true" />
                                                                    </button>
                                                                </div>
                                                                <div className="embu-move-step-buttons">
                                                                    <button type="button" disabled={hokeiIndex === 0} onClick={() => { moveHokei(sequence.id, hokeiIndex, -1); setMoveMenu(null); }}>
                                                                        <ArrowUp aria-hidden="true" />
                                                                        {translator.translate("Upp")}
                                                                    </button>
                                                                    <button type="button" disabled={hokeiIndex === sequence.hokeis.length - 1} onClick={() => { moveHokei(sequence.id, hokeiIndex, 1); setMoveMenu(null); }}>
                                                                        <ArrowDown aria-hidden="true" />
                                                                        {translator.translate("Ner")}
                                                                    </button>
                                                                </div>
                                                                <div className="embu-move-destinations">
                                                                    <span>{translator.translate("Till sekvens")}</span>
                                                                    <div>
                                                                        {draft.sequences.map((targetSequence, targetIndex) => (
                                                                            <button
                                                                                key={targetSequence.id}
                                                                                type="button"
                                                                                disabled={targetSequence.id === sequence.id}
                                                                                aria-label={translator.translate("Flytta {0} till sekvens {1}", { params: [hokei.hokeiName, String(targetIndex + 1)] })}
                                                                                onClick={() => { moveHokeiToSequence(sequence.id, hokei.id, targetSequence.id); setMoveMenu(null); }}
                                                                            >
                                                                                {targetIndex + 1}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </li>
                                                </Fragment>
                                            );
                                        })}
                                        {isDropSequence && dropTarget?.index === remainingHokeiCount && (
                                            <li className="embu-drop-indicator" aria-hidden="true" />
                                        )}
                                    </ul>

                                    {pickerTarget !== sequence.id && (
                                        <button
                                            type="button"
                                            className={sequence.hokeis.length === 0 ? "embu-empty-sequence" : "embu-add-hokei"}
                                            aria-label={translator.translate("Lägg till hokei i sekvens {0}", { params: [String(sequenceIndex + 1)] })}
                                            onClick={() => openPicker(sequence.id)}
                                        >
                                            <Plus aria-hidden="true" />
                                            {sequence.hokeis.length === 0 ? (
                                                <span>{translator.translate(!hasDraftHokeis && sequenceIndex === 0 ? "Välj din första teknik" : "Välj teknik")}</span>
                                            ) : (
                                                <span className="visually-hidden">{translator.translate("Lägg till teknik")}</span>
                                            )}
                                        </button>
                                    )}
                                </div>

                                {pickerTarget === sequence.id && techniquePicker}

                                {isExpanded && (
                                    <div className="embu-sequence-details">
                                        {sequence.hokeis.map(hokei => {
                                            const technique = techniqueLookup.get(embuTechniqueKey(hokei))
                                                ?? techniques.find(candidate => candidate.hokei.hokei_name === hokei.hokeiName);
                                            const attack = technique?.hokei.roles.attacker.action;
                                            return (
                                                <section key={hokei.id} className="embu-hokei-details">
                                                    <div className="embu-hokei-details-heading">
                                                        <button
                                                            type="button"
                                                            disabled={!technique}
                                                            aria-label={translator.translate("Visa teknik {0}", { params: [hokei.hokeiName] })}
                                                            onClick={() => technique && showTechnique(technique)}
                                                        >
                                                            <PracticeTerm value={hokei.hokeiName} dojoMode={dojoMode} />
                                                        </button>
                                                        <button type="button" aria-label={translator.translate("Ta bort {0}", { params: [hokei.hokeiName] })} onClick={() => removeHokei(sequence.id, hokei.id)}>
                                                            <Trash aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                    <div className="embu-hokei-note-line">
                                                        {attack && (
                                                            <span className="embu-hokei-description">
                                                                {translator.translate("kōgeki: {0}", { params: [translator.translate(attack)] })}
                                                            </span>
                                                        )}
                                                        <InlineNoteEditor
                                                            value={hokei.comment}
                                                            onSave={comment => saveHokeiComment(sequence.id, hokei.id, comment)}
                                                            addLabel={translator.translate("Lägg till kommentar till {0}", { params: [hokei.hokeiName] })}
                                                            editLabel={translator.translate("Redigera kommentar till {0}", { params: [hokei.hokeiName] })}
                                                            inputLabel={translator.translate("Kommentar till {0}", { params: [hokei.hokeiName] })}
                                                            placeholder={translator.translate("Skriv din kommentar…")}
                                                            emptyLabel={translator.translate("Lägg till kommentar")}
                                                        />
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>

                {draggedHokei && (
                    <div
                        className="embu-drag-preview"
                        style={{ left: draggedHokei.clientX + 12, top: draggedHokei.clientY + 12 }}
                        aria-hidden="true"
                    >
                        <GripVertical />
                        <span>{translator.translate(draggedHokei.hokeiName)}</span>
                    </div>
                )}

                {pickerTarget === null && hasDraftHokeis && (
                    <div className="embu-builder-actions">
                        <button type="button" className="btn btn-outline-primary embu-practice-button" onClick={() => selectView("practice")}>
                            <PlayCircle aria-hidden="true" />
                            {translator.translate("Träna embun")}
                        </button>
                    </div>
                )}
            </section>
            )}

            {activeView === "practice" && practiceSequence && (
                <section className="free-practice-section embu-practice">
                    <h3 className="visually-hidden">
                        {translator.translate("Sekvens {0}", { params: [String((practiceSequenceEntry?.sequenceIndex ?? 0) + 1)] })}
                    </h3>
                    <div className="embu-practice-sequence">
                        <span className="embu-practice-number" aria-hidden="true">{(practiceSequenceEntry?.sequenceIndex ?? 0) + 1}.</span>
                        <ul className="embu-practice-hokeis">
                            {practiceSequence.hokeis.map(hokei => {
                                const technique = techniqueLookup.get(embuTechniqueKey(hokei))
                                    ?? techniques.find(candidate => candidate.hokei.hokei_name === hokei.hokeiName);
                                const attack = technique?.hokei.roles.attacker.action;
                                return (
                                    <li key={hokei.id}>
                                        <button
                                            type="button"
                                            className="embu-practice-technique"
                                            disabled={!technique}
                                            aria-label={translator.translate("Visa teknik {0}", { params: [hokei.hokeiName] })}
                                            onClick={() => technique && showTechnique(technique)}
                                        >
                                            <PracticeTerm value={hokei.hokeiName} dojoMode />
                                        </button>
                                        {attack && (
                                            <div className="embu-practice-attack">
                                                {translator.translate("kōgeki: {0}", { params: [translator.translate(attack)] })}
                                            </div>
                                        )}
                                        {hokei.comment && <div className="embu-practice-comment">{hokei.comment}</div>}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    <div className="embu-practice-navigation">
                        <button
                            type="button"
                            disabled={visiblePracticeSequenceIndex === 0}
                            onClick={() => setPracticeSequenceIndex(index => Math.max(0, index - 1))}
                        >
                            <ArrowLeft aria-hidden="true" />
                            {translator.translate("Föregående")}
                        </button>
                        <button type="button" className="embu-practice-edit" onClick={() => selectView("builder")}>
                            {translator.translate("Redigera embun")}
                        </button>
                        <button
                            type="button"
                            disabled={visiblePracticeSequenceIndex === practiceSequences.length - 1}
                            onClick={() => setPracticeSequenceIndex(index => Math.min(practiceSequences.length - 1, index + 1))}
                        >
                            {translator.translate("Nästa")}
                            <ArrowRight aria-hidden="true" />
                        </button>
                    </div>
                </section>
            )}

            {preview && (
                <HokeiCard
                    key={`${embuTechniqueKey(preview.technique)}-${preview.requestId}`}
                    hokei={preview.technique.hokei}
                    gradeName={preview.technique.grade}
                    showNotes
                    showRating
                    dojoMode={dojoMode || activeView === "practice"}
                    kamokuLayout
                    defaultOpen
                    onOpenChange={open => {
                        if (!open) setPreview(null);
                    }}
                />
            )}

            {activeView === "kumi" && selected && (
                <section className={`free-practice-section embu-kumi-example${dojoMode ? " is-dojo-mode" : ""}`}>
                    <div className="free-practice-section-heading">
                        <h3 className="app-section-heading">{translator.translate("Kumi-embu")}</h3>
                    </div>
                    <KumiEmbuSequenceList
                        items={selected.sequence.items ?? []}
                        techniques={kumiEmbuTechniques}
                        dojoMode={dojoMode}
                    />
                    {(selected.sequence.videos ?? []).map(video => (
                        <VideoLink key={video.url} video={video} className="mt-3" />
                    ))}
                </section>
            )}
        </div>
    );
};

const PracticeTerm = ({ value, dojoMode }: { value: string; dojoMode: boolean }) => {
    const translator = useContext(TranslatorContext);
    const primary = translator.isJapanese ? translator.japanese(value) : translator.translate(value);
    const japanese = !translator.isJapanese && !dojoMode ? translator.japanese(value) : null;
    const showJapanese = japanese && japanese !== value && japanese !== primary;

    return (
        <span className="free-practice-term">
            <span>{primary}</span>
            {showJapanese && <span className="free-practice-term-japanese">{japanese}</span>}
        </span>
    );
};

export default FreePractice;
