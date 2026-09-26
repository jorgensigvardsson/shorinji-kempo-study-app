import { useContext, useMemo, useState } from "react";
import FlashcardDeck, { type FlashcardDeckEntry } from "./components/FlashcardDeck";
import { HokeiDojoDetails, HokeiNoteEditor } from "./components/HokeiCard";
import { getAllHokeiMoments, type GradeName, type GradePlan, type HokeiMoment } from "./data";
import { TranslatorContext } from "./i18n";
import { gradeLabel } from "./strings";
import { compareGrades } from "./utilities/level";
import { FocusChoicePicker } from "./components/TrainingPageControls";

interface Props {
    allGradePlans: GradePlan[];
    myGrade: GradeName;
}

type GradeSelection = "all" | "up-to-own" | GradeName;

const HokeiFlashcard = ({ allGradePlans, myGrade }: Props) => {
    const translator = useContext(TranslatorContext);
    const gradeGroups = useMemo(() => hokeisByIntroducedGrade(allGradePlans), [allGradePlans]);
    const availableGrades = useMemo(() => gradeGroups.map(group => group.grade), [gradeGroups]);
    const [gradeSelection, setGradeSelection] = useState<GradeSelection>(myGrade);
    const selectedGrades = useMemo(() => new Set(availableGrades.filter(grade => {
        if (gradeSelection === "all") return true;
        if (gradeSelection === "up-to-own") return compareGrades(grade, myGrade) <= 0;
        return grade === gradeSelection;
    })), [availableGrades, gradeSelection, myGrade]);
    const gradeChoices = [
        { value: "all", label: translator.translate("Alla") },
        { value: "up-to-own", label: translator.translate("Alla till och med egna") },
        ...availableGrades.map(grade => ({
            value: grade,
            label: gradeLabel(grade, translator, false),
        })),
    ];

    const selectedHokeis = useMemo(
        () => gradeGroups
            .filter(group => selectedGrades.has(group.grade))
            .flatMap(group => group.hokeis),
        [gradeGroups, selectedGrades],
    );
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

    return (
        <div className="hokei-flashcard-view">
            <div className="hokei-flashcard-filter">
                <FocusChoicePicker
                    title={translator.translate("Välj vad du vill träna")}
                    leadText={translator.translate("Tränar inför")}
                    value={gradeSelection}
                    choices={gradeChoices}
                    onChange={value => setGradeSelection(value as GradeSelection)}
                />
            </div>
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

export default HokeiFlashcard;
