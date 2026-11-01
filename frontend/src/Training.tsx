import { useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { ArrowLeft, Award, Book } from "react-bootstrap-icons";
import Kamoku from "./Kamoku";
import FreePractice, { practiceAreaDefinitions } from "./FreePractice";
import type { PracticeArea } from "./practice-area";
import { parseTrainingPath, trainingPath, type TrainingView } from "./training-routes";
import type { GradePlan, GradeName } from "./data";
import Grid, { type GridItem } from "./components/Grid";
import "./Training.css";
import { useAppBack } from "./use-app-back";

interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    dojoMode?: boolean;
}

const Training = (props: Props) => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    const location = useLocation();
    const dojoMode = props.dojoMode ?? false;
    const { view, area: activePracticeArea } = parseTrainingPath(location.pathname);
    const showOverview = view === "landing" || (view === "free" && activePracticeArea === null);
    const goBack = useAppBack(showOverview ? "/" : "/kamoku");
    // A view stays mounted once seen, so its scroll position, filters, and open
    // cards survive switching away and back. Recording it from the URL rather
    // than from the click that got here also covers arriving by deep link or by
    // browser back and forward.
    const [visitedViews, setVisitedViews] = useState<Set<Exclude<TrainingView, "landing">>>(() =>
        new Set(view === "landing" ? [] : [view]));
    if (view !== "landing" && !visitedViews.has(view)) {
        setVisitedViews(new Set([...visitedViews, view]));
    }

    // Any query string on the way in is unrelated to the training view, so it
    // rides along rather than being dropped by the navigation.
    const goTo = (nextView: TrainingView, area?: PracticeArea | null) =>
        navigate(`${trainingPath(nextView, area)}${location.search}`);

    const selectPracticeArea = (area: PracticeArea | null) => goTo("free", area);

    const plannedChoices: GridItem[] = [
        {
            key: "weekly-practice",
            title: translator.translate("Veckans träning"),
            subtitle: translator.translate("Följ veckoplanen för din grad."),
            icon: <Book />,
            onSelect: () => goTo("plan"),
        },
        {
            key: "grading",
            title: translator.translate("Gradering"),
            subtitle: translator.translate("Se krav inför nästa gradering."),
            icon: <Award />,
            onSelect: () => navigate("/training/grading"),
            navigatesTo: "/training/grading",
        },
    ];

    const chooseYourOwnItems: GridItem[] = practiceAreaDefinitions.map(area => ({
        key: area.key,
        title: translator.translate(area.key === "embu" ? "Embu" : area.title),
        subtitle: translator.translate(area.description),
        icon: area.icon,
        onSelect: () => selectPracticeArea(area.key),
        navigatesTo: trainingPath("free", area.key),
    }));

    return (
        <div className="training-page">
            <section hidden={!showOverview}>
                <button type="button" className="training-back" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate("Tillbaka")}</span>
                </button>
                <header className="training-page-header training-landing-header">
                    <h1 className="app-page-heading">{translator.translate("Träning")}</h1>
                    <p className="app-intro-copy">{translator.translate("Hur vill du träna idag?")}</p>
                </header>
                <div className="training-choice-section">
                    <h2 className="app-eyebrow-heading">{translator.translate("Följ din plan")}</h2>
                    <Grid items={plannedChoices} className="training-choice-grid" />
                </div>
                <div className="training-choice-section">
                    <h2 className="app-eyebrow-heading">{translator.translate("Välj vad du vill träna")}</h2>
                    <Grid items={chooseYourOwnItems} className="training-choice-grid" />
                </div>
            </section>

            {!showOverview && (view === "plan" || activePracticeArea === null) && (
                <button type="button" className="training-back" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate("Tillbaka")}</span>
                </button>
            )}

            <main className="training-view-content" hidden={showOverview}>
                {visitedViews.has("plan") && (
                    <div hidden={view !== "plan"}>
                        <Kamoku {...props} dojoMode={dojoMode} />
                    </div>
                )}
                {visitedViews.has("free") && (
                    <div hidden={view !== "free"}>
                        <FreePractice
                            {...props}
                            activeArea={activePracticeArea}
                            onAreaChange={selectPracticeArea}
                            onBack={goBack}
                            dojoMode={dojoMode}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export default Training;
