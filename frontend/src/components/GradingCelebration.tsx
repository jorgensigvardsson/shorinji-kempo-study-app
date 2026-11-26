import { useContext, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button, Modal } from "react-bootstrap";
import { humanGradeName, nextGrade, type CurrentGrade, type GradeName } from "../data";
import { TranslatorContext } from "../i18n";
import "./GradingCelebration.css";

type Dialog = { step: "confirm" } | { step: "celebrate"; grade: GradeName; burst: number };

const partyColors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#a78bfa", "#ff914d"];

const confetti = Array.from({ length: 96 }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    backgroundColor: partyColors[index % partyColors.length],
    "--confetti-drift": `${((index * 29) % 240) - 120}px`,
    "--confetti-turn": `${index % 2 ? 900 : -720}deg`,
    animationDelay: `${Math.floor(index / 48) * 2 + (index % 12) * 0.06}s`,
    animationDuration: `${2.8 + (index % 9) * 0.18}s`,
}) as CSSProperties);

const sideConfetti = Array.from({ length: 48 }, (_, index) => ({
    left: index % 2 === 0 ? "-1rem" : undefined,
    right: index % 2 === 1 ? "-1rem" : undefined,
    backgroundColor: partyColors[index % partyColors.length],
    "--burst-x": `${(index % 2 === 0 ? 1 : -1) * (20 + (index % 9) * 8)}vw`,
    "--burst-y": `${-35 - (index % 7) * 7}vh`,
    "--confetti-turn": `${index % 2 ? 1080 : -900}deg`,
    animationDelay: `${0.15 + Math.floor(index / 24) * 1.8 + (index % 6) * 0.045}s`,
    animationDuration: `${2.5 + (index % 5) * 0.2}s`,
}) as CSSProperties);

const sparkles = Array.from({ length: 12 }, (_, index) => ({
    left: `${8 + (index * 31) % 84}%`,
    top: `${12 + (index * 23) % 70}%`,
    backgroundColor: partyColors[index % partyColors.length],
    animationDelay: `${0.4 + (index % 6) * 0.48}s`,
}) as CSSProperties);

export default function GradingCelebration({ currentGrade, onSetCurrentGrade }: {
    currentGrade: CurrentGrade;
    onSetCurrentGrade: (grade: CurrentGrade) => void;
}) {
    const translator = useContext(TranslatorContext);
    const titleId = useId();
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const targetGrade = nextGrade(currentGrade);
    const gradeLabel = (grade: GradeName) => translator.translate(humanGradeName(grade), { capitalize: true });
    const close = () => setDialog(null);

    const celebrate = () => {
        if (!targetGrade || dialog?.step !== "confirm") return;
        onSetCurrentGrade(targetGrade);
        setDialog({ step: "celebrate", grade: targetGrade, burst: 0 });
    };

    return <>
        {targetGrade && <div className="grading-celebration-entry">
            <Button variant="outline-primary" onClick={() => setDialog({ step: "confirm" })}>
                <span aria-hidden="true">🎉 </span>{translator.translate("Jag har klarat min gradering!")}
            </Button>
        </div>}
        <Modal show={dialog !== null} onHide={close} centered aria-labelledby={titleId}>
            <Modal.Header closeButton closeLabel={translator.translate("Stäng")}>
                <Modal.Title id={titleId}>
                    {translator.translate(dialog?.step === "celebrate" ? "Grattis till din nya grad!" : "Jag har klarat min gradering!")}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body className="grading-celebration-body">
                {dialog?.step === "confirm" && targetGrade && <>
                    <p>{translator.translate("Har du klarat graderingen till {0}?", { params: [gradeLabel(targetGrade)] })}</p>
                    <p className="text-body-secondary mb-0">{translator.translate("Din grad uppdateras och appen visar innehållet inför din nästa gradering.")}</p>
                </>}
                {dialog?.step === "confirm" && !targetGrade && <p>{translator.translate("Din grad har ändrats. Stäng och försök igen.")}</p>}
                {dialog?.step === "celebrate" && <div key={dialog.burst} className="grading-celebration-success" role="status">
                    <div className="grading-celebration-stage" aria-hidden="true">
                        <span className="grading-celebration-popper is-left">🎉</span>
                        <span className="grading-celebration-emoji">🏆</span>
                        <span className="grading-celebration-popper is-right">🎊</span>
                    </div>
                    <p className="grading-celebration-grade">{gradeLabel(dialog.grade)}</p>
                    <p className="grading-celebration-cheer">{translator.translate("Hurra! Det här är din stund!")}</p>
                    <p className="mb-0">{translator.translate("Du klarade det! Din nya grad är sparad. Var stolt över det du har lärt dig.")}</p>
                </div>}
            </Modal.Body>
            <Modal.Footer>
                {dialog?.step === "confirm" ? <>
                    <Button variant="outline-secondary" onClick={close}>{translator.translate("Avbryt")}</Button>
                    <Button variant="primary" onClick={celebrate} disabled={!targetGrade}>{translator.translate("Ja, jag har klarat den!")}</Button>
                </> : <>
                    <Button variant="outline-primary" onClick={() => setDialog(previous => previous?.step === "celebrate"
                        ? { ...previous, burst: previous.burst + 1 } : previous)}>{translator.translate("Fira igen!")}</Button>
                    <Button variant="primary" onClick={close}>{translator.translate("Stäng")}</Button>
                </>}
            </Modal.Footer>
        </Modal>
        {dialog?.step === "celebrate" && createPortal(
            <div key={dialog.burst} className="grading-confetti" aria-hidden="true">
                {confetti.map((style, index) => <span key={index} className="grading-confetti-piece" style={style} />)}
                {sideConfetti.map((style, index) => <span key={`side-${index}`} className="grading-confetti-piece grading-confetti-side" style={style} />)}
                {sparkles.map((style, index) => <span key={`star-${index}`} className="grading-celebration-sparkle" style={style} />)}
            </div>, document.body,
        )}
    </>;
}
