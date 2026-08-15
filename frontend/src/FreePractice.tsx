import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Form } from "react-bootstrap";
import { ArrowDown, ArrowLeft, ArrowUp, Book, CardHeading, Collection, ExclamationTriangle, ListUl, People, Search, Trash } from "react-bootstrap-icons";
import type { GradeName, GradePlan, HokeiMoment, TanenKihonHokei } from "./data";
import { findGradePlan, getHokeiMoments, getStandardMoments } from "./data";
import Grid, { type GridItem } from "./components/Grid";
import HokeiCard from "./components/HokeiCard";
import VideoLink from "./components/VideoLink";
import List from "./List";
import { TranslatorContext } from "./i18n";
import { gradeLabel, matchesString, normalizeString } from "./strings";
import { compareGrades, compareGradeThenWeek } from "./utilities/level";
import { loadExperimentalEmbuDraft, type EmbuDraft, type EmbuDraftStep } from "./persistence/experimental-embu-draft";
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
        onAreaChange(nextArea);
    };

    const returnToOverview = () => {
        if (activeArea) scrollPositions.current[activeArea] = window.scrollY;
        pendingScrollTarget.current = "overview";
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
                    <h1 ref={overviewHeadingRef} tabIndex={-1}>{translator.translate("Fri träning")}</h1>
                    <p>{translator.translate("Välj ett träningsområde. Du kan byta när du vill.")}</p>
                </header>
                <Grid items={items} className="free-practice-grid" />
            </section>
            <section className="free-practice-area" hidden={activeArea === null}>
                <button type="button" className="free-practice-back" onClick={returnToOverview}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate("Alla träningsområden")}</span>
                </button>
                {activeDefinition && (
                    <header className="free-practice-area-header">
                        <div>
                            <h1 ref={areaHeadingRef} tabIndex={-1}>{translator.translate(activeDefinition.title)}</h1>
                            <p>{translator.translate(activeDefinition.description)}</p>
                        </div>
                    </header>
                )}

            {visitedAreas.has("kihon") && (
                <div hidden={activeArea !== "kihon"}>
                    <KihonArea {...props} dojoMode={dojoMode} />
                </div>
            )}
            {visitedAreas.has("hokei") && (
                <div hidden={activeArea !== "hokei"}>
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
        <div className="free-practice-content kihon-practice-proposal">
            <p className="kihon-design-note">
                {translator.translate("Den här sidan är fortfarande under utformning och kan ändras när som helst.")}
            </p>
            <section className="free-practice-section kihon-practice-group">
                <h3>{translator.translate("Kaisoku dachi / Byakuren chūdan gamae")}</h3>
                <div className="kihon-practice-columns">
                    <KihonTechniqueList title={translator.translate("Angrepp")} items={kaisokuAttacks} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                    <KihonTechniqueList title={translator.translate("Försvar")} items={kaisokuDefences} selectedGrade={selectedGrade} dojoMode={dojoMode} />
                </div>
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3>{translator.translate("Hidari/migi mae")}</h3>
                <KihonTechniqueList items={hidariMigiMaeTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3>{translator.translate("Uke och kontring")}</h3>
                <KihonTechniqueList items={ukeCounterTechniques} selectedGrade={selectedGrade} dojoMode={dojoMode} />
            </section>

            <section className="free-practice-section kihon-practice-group">
                <h3>{translator.translate("Kōbōgi och idō kōbōgi")}</h3>
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
        <div className="free-practice-content free-practice-form-groups">
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
        <h3>{title}</h3>
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
                            <VideoLink key={video.url} video={{ ...video, label: entry.hokei_name }} className="mt-2" />
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
        <div className="free-practice-content randori-practice-groups">
            <RandoriThemeGroup title="gōhō" themes={gohoThemes} dojoMode={dojoMode} />
            <RandoriThemeGroup title="jūhō" themes={juhoThemes} dojoMode={dojoMode} />
            {otherThemes.length > 0 && (
                <RandoriThemeGroup title={translator.translate("Övrigt")} themes={otherThemes} dojoMode={dojoMode} />
            )}
            {unrestrictedFrom && (
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
            <h3><PracticeTerm value={title} dojoMode={dojoMode} /></h3>
            <ul className="free-practice-item-list randori-theme-list">
                {themes.map(theme => (
                    <li key={`${theme.type}|${theme.restriction}`}>
                        <PracticeTerm value={theme.restriction} dojoMode={dojoMode} />
                        <span className="free-practice-item-grade">
                            {gradeLabel(theme.introducedAt, translator, false)}
                        </span>
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

let embuStepId = 0;
const createEmbuStepId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    embuStepId += 1;
    return `embu-step-${Date.now().toString(36)}-${embuStepId}`;
};

const embuTechniqueKey = (technique: Pick<EmbuTechnique, "grade" | "week" | "momentIndex">) =>
    `${technique.grade}|${technique.week}|${technique.momentIndex}`;

const normalizedTechniqueName = (value: string) => normalizeString(value).replace(/\s+/g, " ").trim();

interface KumiEmbuTermPart {
    value: string;
    separator: boolean;
    techniques: EmbuTechnique[];
}

const resolveKumiEmbuTermParts = (value: string, techniques: EmbuTechnique[]): KumiEmbuTermPart[] => {
    const techniquesByName = new Map<string, EmbuTechnique[]>();
    for (const technique of techniques) {
        const name = normalizedTechniqueName(technique.hokei.hokei_name);
        techniquesByName.set(name, [...(techniquesByName.get(name) ?? []), technique]);
    }

    const resolvePart = (rawPart: string): EmbuTechnique[] => {
        const qualifiers = [...rawPart.matchAll(/\(([^)]+)\)/g)]
            .flatMap(match => match[1].split(/[,/]\s*/))
            .map(normalizedTechniqueName);
        const part = rawPart.replace(/\s*\([^)]*\)/g, "").trim();
        const withoutRenHanko = part.replace(/\s+ren hankō$/i, "").trim();
        const candidates = [part, withoutRenHanko, withoutRenHanko.replace(/\btsuki$/i, "zuki")]
            .map(normalizedTechniqueName)
            .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

        let matchedName = candidates.find(candidate => techniquesByName.has(candidate));
        if (!matchedName) {
            matchedName = [...techniquesByName.keys()]
                .filter(name => candidates.some(candidate => candidate.startsWith(`${name} `)))
                .sort((left, right) => right.length - left.length)[0];
        }
        if (!matchedName) {
            matchedName = [...techniquesByName.keys()]
                .filter(name => candidates.some(candidate => {
                    if (!candidate.endsWith(` ${name}`)) return false;
                    const prefix = candidate.slice(0, -(name.length + 1));
                    return (techniquesByName.get(name) ?? []).some(technique =>
                        technique.hokei.variations.some(variation => normalizedTechniqueName(variation) === prefix));
                }))
                .sort((left, right) => right.length - left.length)[0];
        }
        if (!matchedName) return [];

        const matchingTechniques = techniquesByName.get(matchedName) ?? [];
        const qualifiedTechniques = qualifiers.length === 0 ? matchingTechniques : matchingTechniques.filter(technique =>
            qualifiers.every(qualifier => technique.hokei.variations.some(variation =>
                normalizedTechniqueName(variation) === qualifier)));
        const resolved = qualifiedTechniques.length > 0 ? qualifiedTechniques : matchingTechniques;

        return [...resolved.reduce((unique, technique) => {
            const signature = `${normalizedTechniqueName(technique.hokei.hokei_name)}|${technique.hokei.variations.map(normalizedTechniqueName).sort().join("|")}`;
            if (!unique.has(signature)) unique.set(signature, technique);
            return unique;
        }, new Map<string, EmbuTechnique>()).values()];
    };

    return value.split(/(\s+(?:&|-)\s+)/).filter(Boolean).map((part, index) => ({
        value: part,
        separator: index % 2 === 1,
        techniques: index % 2 === 1 ? [] : resolvePart(part),
    }));
};

const EmbuArea = ({ myGrade, allGradePlans, dojoMode }: Pick<Props, "myGrade" | "allGradePlans" | "dojoMode">) => {
    const translator = useContext(TranslatorContext);
    const draftData = useMemo(() => loadExperimentalEmbuDraft(), []);
    const [draft, setDraft] = useState<EmbuDraft>(() => draftData.data);
    const [query, setQuery] = useState("");
    const [activeSuggestion, setActiveSuggestion] = useState(0);
    const [preview, setPreview] = useState<EmbuPreview | null>(null);
    const previewRequestId = useRef(0);
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

    useEffect(() => draftData.registerListener(setDraft), [draftData]);

    const saveDraft = (nextDraft: EmbuDraft) => {
        setDraft(nextDraft);
        draftData.save(nextDraft);
    };

    const addTechnique = (technique: EmbuTechnique) => {
        const step: EmbuDraftStep = {
            id: createEmbuStepId(),
            hokeiName: technique.hokei.hokei_name,
            grade: technique.grade,
            week: technique.week,
            momentIndex: technique.momentIndex,
            transition: "",
        };
        saveDraft({ ...draft, steps: [...draft.steps, step] });
        setQuery("");
        setActiveSuggestion(0);
        window.requestAnimationFrame(() => techniqueSearchRef.current?.focus());
    };

    const updateStep = (id: string, changes: Partial<EmbuDraftStep>) => {
        saveDraft({
            ...draft,
            steps: draft.steps.map(step => step.id === id ? { ...step, ...changes } : step),
        });
    };

    const moveStep = (index: number, direction: -1 | 1) => {
        const destination = index + direction;
        if (destination < 0 || destination >= draft.steps.length) return;
        const steps = [...draft.steps];
        [steps[index], steps[destination]] = [steps[destination], steps[index]];
        saveDraft({ ...draft, steps });
    };

    const removeStep = (id: string) => {
        saveDraft({ ...draft, steps: draft.steps.filter(step => step.id !== id) });
        setPreview(current => current && draft.steps.some(step => step.id === id
            && embuTechniqueKey(step) === embuTechniqueKey(current.technique)) ? null : current);
    };

    const showTechnique = (technique: EmbuTechnique) => {
        previewRequestId.current += 1;
        setPreview({ technique, requestId: previewRequestId.current });
    };

    const chooseActiveSuggestion = () => {
        const suggestion = suggestions[activeSuggestion];
        if (suggestion) addTechnique(suggestion);
    };

    return (
        <div className="free-practice-content">
            <section className="free-practice-section embu-builder">
                <div className="embu-builder-heading">
                    <h3>{translator.translate("Bygg embu")}</h3>
                    <span className="embu-experimental-label">
                        <ExclamationTriangle aria-hidden="true" />
                        {translator.translate("Experimentell")}
                    </span>
                </div>
                <p className="embu-experimental-note">
                    {translator.translate("Det här är en prototyp. Utkastet sparas bara på den här enheten och kommer att försvinna när experimentfasen avslutas.")}
                </p>
                <p className="free-practice-source-note">
                    {translator.translate("Sätt ihop din embu med tekniker och egna övergångar. Utkastet sparas automatiskt.")}
                </p>

                <Form.Group className="embu-overall-notes" controlId="embu-overall-notes">
                    <Form.Label>{translator.translate("Anteckningar för hela embun")}</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={3}
                        value={draft.notes}
                        placeholder={translator.translate("Idé, tema eller sådant ni vill komma ihåg…")}
                        onChange={event => saveDraft({ ...draft, notes: event.target.value })}
                    />
                </Form.Group>

                <div className="embu-technique-picker">
                    <Form.Label htmlFor="embu-technique-search">{translator.translate("Lägg till teknik")}</Form.Label>
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
                                    setQuery("");
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
                                    onClick={() => addTechnique(technique)}
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

                {draft.steps.length === 0 ? (
                    <p className="embu-empty-state">{translator.translate("Din embu är tom. Sök efter den första tekniken ovan.")}</p>
                ) : (
                    <ol className="embu-draft-steps">
                        {draft.steps.map((step, index) => {
                            const technique = techniqueLookup.get(embuTechniqueKey(step))
                                ?? techniques.find(candidate => candidate.hokei.hokei_name === step.hokeiName);
                            return (
                                <li key={step.id}>
                                    <div className="embu-step-row">
                                        <span className="embu-step-number" aria-hidden="true">{index + 1}</span>
                                        <button
                                            type="button"
                                            className="embu-step-technique"
                                            disabled={!technique}
                                            aria-label={translator.translate("Visa teknik {0}", { params: [step.hokeiName] })}
                                            onClick={() => technique && showTechnique(technique)}
                                        >
                                            <PracticeTerm value={step.hokeiName} dojoMode={dojoMode} />
                                        </button>
                                        <div className="embu-step-actions">
                                            <button type="button" disabled={index === 0} aria-label={translator.translate("Flytta {0} upp", { params: [step.hokeiName] })} onClick={() => moveStep(index, -1)}>
                                                <ArrowUp aria-hidden="true" />
                                            </button>
                                            <button type="button" disabled={index === draft.steps.length - 1} aria-label={translator.translate("Flytta {0} ner", { params: [step.hokeiName] })} onClick={() => moveStep(index, 1)}>
                                                <ArrowDown aria-hidden="true" />
                                            </button>
                                            <button type="button" aria-label={translator.translate("Ta bort {0}", { params: [step.hokeiName] })} onClick={() => removeStep(step.id)}>
                                                <Trash aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                    {index < draft.steps.length - 1 && (
                                        <div className="embu-transition">
                                            <span aria-hidden="true">↓</span>
                                            <Form.Control
                                                as="textarea"
                                                rows={2}
                                                aria-label={translator.translate("Övergång efter {0}", { params: [step.hokeiName] })}
                                                value={step.transition}
                                                placeholder={translator.translate("Kommentar eller övergång till nästa teknik…")}
                                                onChange={event => updateStep(step.id, { transition: event.target.value })}
                                            />
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>

            {preview && (
                <HokeiCard
                    key={`${embuTechniqueKey(preview.technique)}-${preview.requestId}`}
                    hokei={preview.technique.hokei}
                    gradeName={preview.technique.grade}
                    showNotes
                    showRating
                    dojoMode={dojoMode}
                    kamokuLayout
                    defaultOpen
                    onOpenChange={open => {
                        if (!open) setPreview(null);
                    }}
                />
            )}

            {selected && (
                <section className="free-practice-section">
                    <div className="free-practice-section-heading">
                        <h3>{translator.translate("Kumi-embu")}</h3>
                    </div>
                    <ol className="free-practice-sequence-list">
                        {(selected.sequence.items ?? []).map((step, index) => {
                            const term = step.term?.romaji;
                            return (
                                <li key={`${selected.grade}.${index}`}>
                                    {term && (
                                        <KumiEmbuStepTerm
                                            value={term}
                                            techniques={techniques}
                                            dojoMode={dojoMode}
                                            onSelect={showTechnique}
                                        />
                                    )}
                                    {step.annotations?.map((annotation, annotationIndex) => (
                                        <div className="free-practice-step-note" key={annotationIndex}>
                                            {translator.translate(annotation.text)}
                                        </div>
                                    ))}
                                </li>
                            );
                        })}
                    </ol>
                    {(selected.sequence.videos ?? []).map(video => (
                        <VideoLink key={video.url} video={video} className="mt-3" />
                    ))}
                </section>
            )}
        </div>
    );
};

const KumiEmbuStepTerm = ({ value, techniques, dojoMode, onSelect }: {
    value: string;
    techniques: EmbuTechnique[];
    dojoMode: boolean;
    onSelect: (technique: EmbuTechnique) => void;
}) => {
    const translator = useContext(TranslatorContext);
    const parts = resolveKumiEmbuTermParts(value, techniques);
    const hasLinkedTechnique = parts.some(part => part.techniques.length > 0);

    if (!hasLinkedTechnique) return <PracticeTerm value={value} dojoMode={dojoMode} />;

    const japanese = !translator.isJapanese && !dojoMode ? translator.japanese(value) : null;
    const primary = translator.translate(value);
    const showJapanese = japanese && japanese !== value && japanese !== primary;

    return (
        <span className="free-practice-term">
            <span className="kumi-embu-inline-term">
                {parts.map((part, index) => {
                    if (part.separator) {
                        const separator = part.value.trim() === "&" ? "\u00a0&\u00a0" : part.value;
                        return <span key={`${index}.${part.value}`}>{separator}</span>;
                    }
                    const label = translator.isJapanese ? translator.japanese(part.value) : translator.translate(part.value);
                    return part.techniques.length > 0 ? (
                        <button
                            key={`${index}.${part.value}`}
                            type="button"
                            className="kumi-embu-step-button"
                            aria-label={translator.translate("Visa teknik {0}", { params: [part.value.trim()] })}
                            onClick={() => onSelect(part.techniques[0])}
                        >
                            {label}
                        </button>
                    ) : (
                        <span key={`${index}.${part.value}`}>{label}</span>
                    );
                })}
            </span>
            {showJapanese && <span className="free-practice-term-japanese">{japanese}</span>}
        </span>
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
