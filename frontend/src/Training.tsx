import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TranslatorContext } from "./i18n";
import { ArrowLeft, Book, Collection } from "react-bootstrap-icons";
import Kamoku from "./Kamoku";
import FreePractice from "./FreePractice";
import { isPracticeArea, type PracticeArea } from "./practice-area";
import type { GradePlan, GradeName } from "./data";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data";
import Grid, { type GridItem } from "./components/Grid";
import "./Training.css";

interface Props {
    myGrade: GradeName;
    allGradePlans: GradePlan[];
    notesData: HokeiNotes;
    ranksData: HokeiRanks;
}

type TrainingView = "landing" | "plan" | "free";

const Training = (props: Props) => {
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [dojoMode, setDojoMode] = useState(false);
    const requestedView = searchParams.get("view");
    const isLegacyAllHokei = requestedView === "all";
    const view: TrainingView = requestedView === "plan"
        ? "plan"
        : requestedView === "free" || isLegacyAllHokei
            ? "free"
            : "landing";
    const activePracticeArea = isLegacyAllHokei
        ? "hokei"
        : isPracticeArea(searchParams.get("area"))
            ? searchParams.get("area") as PracticeArea
            : null;
    const [visitedViews, setVisitedViews] = useState<Set<Exclude<TrainingView, "landing">>>(() =>
        new Set(view === "landing" ? [] : [view]));

    useEffect(() => {
        if (!isLegacyAllHokei) return;
        setSearchParams(currentParams => {
            const nextParams = new URLSearchParams(currentParams);
            nextParams.set("view", "free");
            nextParams.set("area", "hokei");
            return nextParams;
        }, { replace: true });
    }, [isLegacyAllHokei, setSearchParams]);

    const selectView = (nextView: Exclude<TrainingView, "landing"> | null) => {
        if (nextView) {
            setVisitedViews(current => current.has(nextView) ? current : new Set([...current, nextView]));
        }
        setSearchParams(currentParams => {
            const nextParams = new URLSearchParams(currentParams);
            if (nextView) {
                nextParams.set("view", nextView);
            } else {
                nextParams.delete("view");
            }
            if (nextView !== "free") nextParams.delete("area");
            return nextParams;
        });
    };

    const selectPracticeArea = (area: PracticeArea | null) => {
        setSearchParams(currentParams => {
            const nextParams = new URLSearchParams(currentParams);
            nextParams.set("view", "free");
            if (area) nextParams.set("area", area);
            else nextParams.delete("area");
            return nextParams;
        });
    };

    const choices: GridItem[] = [
        {
            key: "weekly-practice",
            title: translator.translate("Veckans träning"),
            subtitle: translator.translate("Följ veckoplanen för din grad."),
            icon: <Book />,
            onSelect: () => selectView("plan"),
        },
        {
            key: "free-practice",
            title: translator.translate("Fri träning"),
            subtitle: translator.translate("Välj själv vad du vill träna."),
            icon: <Collection />,
            onSelect: () => selectView("free"),
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
                        <Kamoku {...props} dojoMode={dojoMode} onDojoModeChange={setDojoMode} />
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
                            onDojoModeChange={setDojoMode}
                        />
                    </div>
                )}
            </main>
        </div>
    );
};

export default Training;
