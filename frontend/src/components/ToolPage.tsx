import { useContext, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "react-bootstrap-icons";
import { TranslatorContext } from "../i18n";
import "./ToolPage.css";

// The frame the tools under Teori and Träning sit in: the page itself plus a back
// link to the section it was opened from. It lives apart from Theory.tsx and
// Training.tsx because those two pull in the whole training area — Kamoku and
// FreePractice between them — and every tool page would then have to load it just to
// render a back button.

// The two areas name their wrapper and back button differently, and the names are
// load-bearing for the stylesheets, so they are spelled out rather than derived.
const ToolPage = ({ className, backClassName, label, children }:
    { className: string; backClassName: string; label: string; children: ReactNode }) => {
    const navigate = useNavigate();

    return (
        <div className={className}>
            <button type="button" className={backClassName} onClick={() => navigate(-1)}>
                <ArrowLeft aria-hidden="true" />
                <span>{label}</span>
            </button>
            {children}
        </div>
    );
};

export const TheoryToolPage = ({ children }: { children: ReactNode }) => {
    const translator = useContext(TranslatorContext);
    return (
        <ToolPage className="theory-tool-page" backClassName="theory-back" label={translator.translate("Teori")}>
            {children}
        </ToolPage>
    );
};

export const TrainingToolPage = ({ children }: { children: ReactNode }) => {
    const translator = useContext(TranslatorContext);
    const location = useLocation();
    // The grading tool is reached from two places; when it was opened on a category
    // the back link goes to the grading overview rather than out to Träning.
    const isGradingCategory = location.pathname === "/training/grading"
        && new URLSearchParams(location.search).has("gradingCategory");

    return (
        <ToolPage className="training-page" backClassName="training-back"
                  label={translator.translate(isGradingCategory ? "Gradering" : "Träning")}>
            {children}
        </ToolPage>
    );
};
