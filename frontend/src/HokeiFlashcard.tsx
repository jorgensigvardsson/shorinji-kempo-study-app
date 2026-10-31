import { useContext, useMemo, useState } from "react";
import { Button, Modal, ProgressBar } from "react-bootstrap";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import { HokeiDojoDetails, HokeiNoteEditor } from "./components/HokeiCard";
import { getAllHokeiMoments, type GradeName, type GradePlan, type HokeiMoment } from "./data";
import { useRememberedGradeSelection } from "./grade-selection-memory";
import { TranslatorContext, type Translator } from "./i18n";
import { gradeLabel } from "./strings";
import { compareGrades } from "./utilities/level";
import { FocusChoicePicker } from "./components/TrainingPageControls";
import type { FlashCardKnownEntry } from "./persistence/schema";
import { setAppData, useAppData } from "./persistence/use-app-data";

interface Props {
    allGradePlans: GradePlan[];
    myGrade: GradeName;
}

type GradeSelection = "all" | "up-to-own" | GradeName;

const HokeiFlashcard = ({ allGradePlans, myGrade }: Props) => {
    const translator = useContext(TranslatorContext);
    const gradeGroups = useMemo(() => hokeisByIntroducedGrade(allGradePlans), [allGradePlans]);
    const availableGrades = useMemo(() => gradeGroups.map(group => group.grade), [gradeGroups]);
    const knownFlashCards = useAppData("knownFlashCards");
    const [showProgress, setShowProgress] = useState(false);
    const allHokeis = useMemo(
        () => gradeGroups.flatMap(group => group.hokeis),
        [gradeGroups],
    );
    const gradeChoices = [
        { value: "all", label: translator.translate("Alla grader") },
        // Named rather than "own": whether that meant the grade held or the one
        // trained towards was anybody's guess, and it is the latter.
        { value: "up-to-own", label: translator.translate("Alla till och med {0}", { params: [gradeLabel(myGrade, translator, false)] }) },
        ...availableGrades.map(grade => ({
            value: grade,
            label: gradeLabel(grade, translator, false),
        })),
    ];
    // Remembered on this device. A choice made for an earlier training grade is
    // not carried over, so moving on still starts the deck from the new grade.
    const [gradeSelection, setGradeSelection] = useRememberedGradeSelection<GradeSelection>(
        "hokei-flashcards", myGrade, gradeChoices.map(choice => choice.value));
    const selectedGrades = useMemo(() => new Set(availableGrades.filter(grade => {
        if (gradeSelection === "all") return true;
        if (gradeSelection === "up-to-own") return compareGrades(grade, myGrade) <= 0;
        return grade === gradeSelection;
    })), [availableGrades, gradeSelection, myGrade]);

    const selectedHokeis = useMemo(
        () => gradeGroups
            .filter(group => selectedGrades.has(group.grade))
            .flatMap(group => group.hokeis),
        [gradeGroups, selectedGrades],
    );
    const selectedKnownCount = selectedHokeis.filter(hokei =>
        knownFlashCards[`hokei:${hokei.id}`]?.known).length;
    const cards = useMemo<FlashcardDeckEntry[]>(() => selectedHokeis.map(hokei => {
        const romajiName = hokei.hokei_name;
        const kanjiName = translator.japanese(hokei.hokei_name);
        const learnedName = translator.isJapanese
            ? kanjiName
            : translator.translate(hokei.hokei_name, { capitalize: true });
        return {
            // Namespacing separates hokei progress from the historical numeric word ids.
            id: `hokei:${hokei.id}`,
            indexLabel: translator.translate("Hokei"),
            front: (
                <div className="flashcard-hokei-front">
                    <h1 className="flashcard-hokei-name">{kanjiName}</h1>
                    {kanjiName !== romajiName && (
                        <p className="flashcard-hokei-romaji">{romajiName}</p>
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
                    <span className="fw-semibold">{learnedName}</span>
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
    const resetAllHokeiCards = () => {
        const now = new Date().toISOString();
        const updated = { ...knownFlashCards };
        for (const hokei of allHokeis) {
            updated[`hokei:${hokei.id}`] = { known: false, updatedAt: now };
        }
        setAppData("knownFlashCards", updated);
    };

    return (
        <div className="hokei-flashcard-view">
            <div className="hokei-flashcard-filter">
                <FocusChoicePicker
                  showOwnGrade
                    title={translator.translate("Välj vad du vill träna")}
                    leadText={translator.translate("Tränar inför")}
                    value={gradeSelection}
                    choices={gradeChoices}
                    onChange={value => setGradeSelection(value as GradeSelection)}
                />
                <Button type="button" variant="outline-secondary" className="hokei-flashcard-progress-trigger" onClick={() => setShowProgress(true)}>
                    <span>{translator.translate("Framsteg")}</span>
                    <span>{selectedKnownCount}/{selectedHokeis.length}</span>
                </Button>
            </div>
            <HokeiProgressModal
                show={showProgress}
                onHide={() => setShowProgress(false)}
                gradeGroups={gradeGroups}
                knownFlashCards={knownFlashCards}
                onReset={resetAllHokeiCards}
                translator={translator}
            />
            <FlashcardDeck
                key={gradeSelection}
                cards={cards}
                swipeOnly
                hideFaceLabels
                hideFlipHints
                hideIndexLabel
            />
        </div>
    );
};
const HokeiProgressModal = ({
    show,
    onHide,
    gradeGroups,
    knownFlashCards,
    onReset,
    translator,
}: {
    show: boolean;
    onHide: () => void;
    gradeGroups: GradeGroup[];
    knownFlashCards: Record<string, FlashCardKnownEntry>;
    onReset: () => void;
    translator: Translator;
}) => {
    const [confirmReset, setConfirmReset] = useState(false);

    const close = () => {
        setConfirmReset(false);
        onHide();
    };

    const reset = () => {
        onReset();
        setConfirmReset(false);
    };

    return (
        <Modal show={show} onHide={close} scrollable centered>
            <Modal.Header closeButton>
                <Modal.Title>{translator.translate("Framsteg")}</Modal.Title>
            </Modal.Header>
            {confirmReset ? (
                <>
                    <Modal.Body>
                        <h3 className="h5">{translator.translate("Återställa alla Hokei-kort?")}</h3>
                        <p className="mb-0">
                            {translator.translate("Alla Hokei-kort markeras som kvar att öva. Flashkorten i ordlistan påverkas inte.")}
                        </p>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="outline-secondary" onClick={() => setConfirmReset(false)}>
                            {translator.translate("Avbryt")}
                        </Button>
                        <Button variant="danger" onClick={reset}>
                            {translator.translate("Återställ")}
                        </Button>
                    </Modal.Footer>
                </>
            ) : (
                <>
                    <Modal.Body>
                        <p className="text-body-secondary">
                            {translator.translate("Din trygghet bygger på vilka Hokei-kort du har markerat med Kan det.")}
                        </p>
                        <div className="hokei-flashcard-progress-list" role="list">
                            {gradeGroups.map(group => {
                                const known = group.hokeis.filter(hokei =>
                                    knownFlashCards[`hokei:${hokei.id}`]?.known).length;
                                const percent = group.hokeis.length === 0
                                    ? 0
                                    : Math.round(known / group.hokeis.length * 100);
                                return (
                                    <div className="hokei-flashcard-progress-row" role="listitem" key={group.grade}>
                                        <div className="hokei-flashcard-progress-line">
                                            <strong>{gradeLabel(group.grade, translator, false)}</strong>
                                            <span>{known}/{group.hokeis.length} · {translator.translate(confidenceStatus(percent))}</span>
                                        </div>
                                        <ProgressBar
                                            now={percent}
                                            variant={percent === 100 ? "success" : percent >= 60 ? "info" : "warning"}
                                            label={translator.translate("{0} procent trygg", { params: [String(percent)] })}
                                            visuallyHidden
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="outline-danger" onClick={() => setConfirmReset(true)}>
                            {translator.translate("Återställ alla Hokei-kort")}
                        </Button>
                        <Button variant="secondary" onClick={close}>
                            {translator.translate("Stäng")}
                        </Button>
                    </Modal.Footer>
                </>
            )}
        </Modal>
    );
};

interface GradeGroup {
    grade: GradeName;
    hokeis: HokeiMoment[];
}

const hokeisByIntroducedGrade = (plans: GradePlan[]): GradeGroup[] => {
    const seen = new Set<string>();
    const result: GradeGroup[] = [];
    const sortedPlans = [...plans].sort((a, b) => compareGrades(a.grade, b.grade));
    for (const plan of sortedPlans) {
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
