import { useContext, useEffect, useMemo, useState } from "react";
import { Button, Form, ProgressBar } from "react-bootstrap";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import { HokeiDojoDetails, HokeiNoteEditor } from "./components/HokeiCard";
import { getAllHokeiMoments, type GradeName, type GradePlan, type HokeiMoment } from "./data";
import { TranslatorContext } from "./i18n";
import { getAppDataStore } from "./persistence/store";
import type { FlashCardKnownEntry } from "./persistence/schema";
import { gradeLabel } from "./strings";
import { compareGrades } from "./utilities/level";

interface Props {
    allGradePlans: GradePlan[];
    myGrade: GradeName;
}

const HokeiFlashcard = ({ allGradePlans, myGrade }: Props) => {
    const translator = useContext(TranslatorContext);
    const store = getAppDataStore();
    const gradeGroups = useMemo(() => hokeisByIntroducedGrade(allGradePlans, myGrade), [allGradePlans, myGrade]);
    const availableGrades = useMemo(() => gradeGroups.map(group => group.grade), [gradeGroups]);
    const [selectedGrades, setSelectedGrades] = useState<Set<GradeName>>(() => new Set(availableGrades));
    const [hasStarted, setHasStarted] = useState(false);
    const [knownFlashCards, setKnownFlashCards] = useState<Record<string, FlashCardKnownEntry>>(
        () => store.get("knownFlashCards"),
    );

    useEffect(
        () => store.subscribe("knownFlashCards", entries => setKnownFlashCards(entries)),
        [store],
    );

    const selectedHokeis = useMemo(
        () => gradeGroups
            .filter(group => selectedGrades.has(group.grade))
            .flatMap(group => group.hokeis),
        [gradeGroups, selectedGrades],
    );
    const cards = useMemo<FlashcardDeckEntry[]>(() => selectedHokeis.map(hokei => {
        const name = translator.isJapanese
            ? translator.japanese(hokei.hokei_name)
            : translator.translate(hokei.hokei_name, { capitalize: true });
        const japaneseName = !translator.isJapanese ? translator.japanese(hokei.hokei_name) : null;
        return {
            // Namespacing separates hokei progress from the historical numeric word ids.
            id: `hokei:${hokei.id}`,
            indexLabel: translator.translate("Hokei"),
            front: (
                <div className="flashcard-hokei-front">
                    <h1 className="flashcard-hokei-name">{name}</h1>
                    {japaneseName && japaneseName !== hokei.hokei_name && (
                        <p className="flashcard-hokei-japanese">{japaneseName}</p>
                    )}
                    {hokei.variations.length > 0 && (
                        <p className="flashcard-hokei-variations">
                            {hokei.variations.map(variation => translator.translate(variation)).join(", ")}
                        </p>
                    )}
                </div>
            ),
            back: (
                <div className="flashcard-hokei-back">
                    <HokeiDojoDetails hokei={hokei} />
                    <HokeiNoteEditor hokei={hokei} />
                </div>
            ),
            learnedLabel: (
                <>
                    <span className="fw-semibold">{name}</span>
                    {hokei.variations.length > 0 && (
                        <span className="text-muted ms-2 small">
                            {hokei.variations.map(variation => translator.translate(variation)).join(", ")}
                        </span>
                    )}
                </>
            ),
            interactiveBack: true,
        };
    }), [selectedHokeis, translator]);

    const toggleGrade = (grade: GradeName) => {
        setSelectedGrades(previous => {
            const next = new Set(previous);
            if (next.has(grade)) next.delete(grade);
            else next.add(grade);
            return next;
        });
    };

    const allSelected = availableGrades.every(grade => selectedGrades.has(grade));

    if (hasStarted) {
        return (
            <div className="hokei-flashcard-view">
                <div className="hokei-flashcard-session-actions">
                    <Button type="button" variant="link" onClick={() => setHasStarted(false)}>
                        {translator.translate("Ändra grader")}
                    </Button>
                </div>
                <FlashcardDeck cards={cards} swipeOnly />
            </div>
        );
    }

    return (
        <div className="hokei-flashcard-view hokei-flashcard-setup">
            <section className="hokei-flashcard-grades" aria-labelledby="hokei-flashcard-grades-heading">
                <div className="hokei-flashcard-grades-heading">
                    <div>
                        <h2 id="hokei-flashcard-grades-heading">{translator.translate("Välj grader att öva")}</h2>
                        <p>{translator.translate("Din trygghet bygger på vilka Hokei-kort du har markerat med Kan det.")}</p>
                    </div>
                    <Button
                        type="button"
                        variant="link"
                        className="hokei-flashcard-select-all"
                        onClick={() => setSelectedGrades(allSelected ? new Set() : new Set(availableGrades))}
                    >
                        {translator.translate(allSelected ? "Avmarkera alla" : "Välj alla")}
                    </Button>
                </div>
                <div className="hokei-flashcard-grade-list">
                    {gradeGroups.map(group => {
                        const known = group.hokeis.filter(hokei => knownFlashCards[`hokei:${hokei.id}`]?.known).length;
                        const percent = group.hokeis.length === 0 ? 0 : Math.round(known / group.hokeis.length * 100);
                        const status = confidenceStatus(percent);
                        return (
                            <label className="hokei-flashcard-grade" key={group.grade}>
                                <Form.Check
                                    type="checkbox"
                                    checked={selectedGrades.has(group.grade)}
                                    onChange={() => toggleGrade(group.grade)}
                                    aria-label={translator.translate("Öva {0}", { params: [gradeLabel(group.grade, translator, false)] })}
                                />
                                <span className="hokei-flashcard-grade-copy">
                                    <span className="hokei-flashcard-grade-line">
                                        <strong>{gradeLabel(group.grade, translator, false)}</strong>
                                        <span>{known}/{group.hokeis.length} · {translator.translate(status)}</span>
                                    </span>
                                    <ProgressBar
                                        now={percent}
                                        variant={percent === 100 ? "success" : percent >= 60 ? "info" : "warning"}
                                        label={translator.translate("{0} procent trygg", { params: [String(percent)] })}
                                        visuallyHidden
                                    />
                                </span>
                            </label>
                        );
                    })}
                </div>
                <div className="hokei-flashcard-start">
                    <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        disabled={selectedGrades.size === 0}
                        onClick={() => setHasStarted(true)}
                    >
                        {translator.translate("Nu kör vi")}
                    </Button>
                </div>
            </section>
        </div>
    );
};

interface GradeGroup {
    grade: GradeName;
    hokeis: HokeiMoment[];
}

const hokeisByIntroducedGrade = (plans: GradePlan[], myGrade: GradeName): GradeGroup[] => {
    const seen = new Set<string>();
    const result: GradeGroup[] = [];
    const eligiblePlans = [...plans]
        .filter(plan => compareGrades(plan.grade, myGrade) <= 0)
        .sort((a, b) => compareGrades(a.grade, b.grade));
    for (const plan of eligiblePlans) {
        const hokeis: HokeiMoment[] = [];
        for (const hokei of getAllHokeiMoments(plan)) {
            if (seen.has(hokei.id)) continue;
            seen.add(hokei.id);
            hokeis.push(hokei);
        }
        if (hokeis.length > 0) result.push({ grade: plan.grade, hokeis });
    }
    return result;
};

const confidenceStatus = (percent: number): "Trygg" | "På god väg" | "Bra att öva" => {
    if (percent === 100) return "Trygg";
    if (percent >= 60) return "På god väg";
    return "Bra att öva";
};

export default HokeiFlashcard;
