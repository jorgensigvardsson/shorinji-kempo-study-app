import { useContext, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { ArrowLeft, Award, Book, Collection } from "react-bootstrap-icons";
import Kamoku from "./Kamoku";
import FreePractice from "./FreePractice";
import type { PracticeArea } from "./practice-area";
import { parseTrainingPath, trainingPath, type TrainingView } from "./training-routes";
import type { GradePlan, GradeName } from "./data";
import Grid, { type GridItem } from "./components/Grid";
import "./Training.css";

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

    const choices: GridItem[] = [
        {
            key: "weekly-practice",
            title: translator.translate("Veckans träning"),
            subtitle: translator.translate("Följ veckoplanen för din grad."),
            icon: <Book />,
            onSelect: () => goTo("plan"),
        },
        {
            key: "free-practice",
            title: translator.translate("Fri träning"),
            subtitle: translator.translate("Välj själv vad du vill träna."),
            icon: <Collection />,
            onSelect: () => goTo("free"),
        },
        {
            key: "grading",
            title: translator.translate("Gradering"),
            subtitle: translator.translate("Se krav inför nästa gradering."),
            icon: <Award />,
            onSelect: () => navigate("/training/grading"),
        },
    ];

    return (
        <div className="training-page">
            <section hidden={view !== "landing"}>
                <button type="button" className="training-back" onClick={() => navigate(-1)}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate("Träning eller teori")}</span>
                </button>
                <header className="training-page-header training-landing-header">
                    <h1>{translator.translate("Träning")}</h1>
                    <p>{translator.translate("Hur vill du träna idag?")}</p>
                </header>
                <Grid items={choices} className="training-choice-grid" />
            </section>

            {view !== "landing" && (view === "plan" || activePracticeArea === null) && (
                <button type="button" className="training-back" onClick={() => navigate(-1)}>
                    <ArrowLeft aria-hidden="true" />
                    <span>{translator.translate("Träningsval")}</span>
                </button>
            )}

            <main className="training-view-content" hidden={view === "landing"}>
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
                            onBack={() => navigate(-1)}
                            dojoMode={dojoMode}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export const TrainingToolPage = ({ children }: { children: ReactNode }) => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    const location = useLocation();
    const isGradingCategory = location.pathname === "/training/grading"
        && new URLSearchParams(location.search).has("gradingCategory");

    return (
        <div className="training-page">
            <button type="button" className="training-back" onClick={() => navigate(-1)}>
                <ArrowLeft aria-hidden="true" />
                <span>{translator.translate(isGradingCategory ? "Gradering" : "Träning")}</span>
            </button>
            {children}
        </div>
    );
};

export default Training;
