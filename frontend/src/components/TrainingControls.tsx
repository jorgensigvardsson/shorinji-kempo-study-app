import { useContext, useEffect, useRef, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { Sliders2 } from "react-bootstrap-icons";
import { useLocation } from "react-router-dom";
import type { GradeName, GradePlan } from "../data";
import { noTranslate, TranslatorContext } from "../i18n";
import { gradeLabel } from "../strings";
import FontPicker from "./FontPicker";
import type { FontFilter } from "../google-fonts";
import "./TrainingControls.css";

const TRAINING_MODE_INTRO_KEY = "training-mode-intro-seen";

interface Props {
    grade: GradeName;
    gradePlans: GradePlan[];
    onGradeChange: (grade: GradeName) => void;
    showGrade: boolean;
    showTrainingMode: boolean;
    trainingMode: boolean;
    onTrainingModeChange: (active: boolean) => void;
    // Experimental font pickers (see src/google-fonts.ts's isFontPickerEnabled),
    // one for body text, one for headings and one for kanji/kana -- undefined
    // hides that one. filter/onFilterChange live here (not as FontPicker's own
    // state) because this panel unmounts on every route change, which would
    // otherwise reset them.
    bodyFontPicker?: FontPickerProps;
    headingFontPicker?: FontPickerProps;
    kanjiFontPicker?: FontPickerProps;
}

interface FontPickerProps {
    value: string;
    onChange: (family: string) => void;
    filter: FontFilter;
    onFilterChange: (filter: FontFilter) => void;
}

const TrainingControls = ({
    grade,
    gradePlans,
    onGradeChange,
    showGrade,
    showTrainingMode,
    trainingMode,
    onTrainingModeChange,
    bodyFontPicker,
    headingFontPicker,
    kanjiFontPicker,
}: Props) => {
    const translator = useContext(TranslatorContext);
    const location = useLocation();
    const rootRef = useRef<HTMLDivElement>(null);
    const locationKey = `${location.pathname}${location.search}`;
    const [expandedAt, setExpandedAt] = useState<string | null>(null);
    const [introDismissed, setIntroDismissed] = useState(
        () => localStorage.getItem(TRAINING_MODE_INTRO_KEY) === "true",
    );
    const expanded = expandedAt === locationKey;
    const showIntro = showTrainingMode && !introDismissed;

    useEffect(() => {
        if (!expanded) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setExpandedAt(null);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setExpandedAt(null);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [expanded]);

    if (!showGrade && !showTrainingMode && !bodyFontPicker && !headingFontPicker && !kanjiFontPicker) return null;

    const dismissIntro = () => {
        localStorage.setItem(TRAINING_MODE_INTRO_KEY, "true");
        setIntroDismissed(true);
    };

    return (
        <>
            <div className="training-controls-layer d-print-none">
                <div ref={rootRef} className={`training-controls${expanded ? " is-expanded" : ""}`}>
                    <Button
                        type="button"
                        variant={trainingMode ? "outline-warning" : "outline-secondary"}
                        className="training-controls-trigger"
                        aria-label={translator.translate("Träningsverktyg")}
                        aria-expanded={expanded}
                        onClick={() => setExpandedAt(current => current === locationKey ? null : locationKey)}
                    >
                        <Sliders2 aria-hidden="true" />
                    </Button>

                    {expanded && (
                        <div className="training-controls-panel">
                            {showGrade && (
                                <Form.Group className="training-controls-grade" controlId="global-display-grade">
                                    <Form.Label>{translator.translate("Visad grad")}</Form.Label>
                                    <Form.Select
                                        size="sm"
                                        value={grade}
                                        onChange={event => onGradeChange(event.target.value as GradeName)}
                                    >
                                        {gradePlans.map(plan => (
                                            <option key={plan.grade} value={plan.grade}>
                                                {gradeLabel(plan.grade, translator, false)}
                                            </option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                            )}
                            {showTrainingMode && (
                                <Form.Check
                                    type="switch"
                                    id="global-training-mode"
                                    className="training-controls-mode"
                                    label={translator.translate("Dojo-läge")}
                                    checked={trainingMode}
                                    onChange={event => onTrainingModeChange(event.target.checked)}
                                />
                            )}
                            {bodyFontPicker && (
                                <Form.Group className="training-controls-font" controlId="global-font-family-body">
                                    <Form.Label>{noTranslate("Body font")}</Form.Label>
                                    <FontPicker
                                        label="Body"
                                        value={bodyFontPicker.value}
                                        onChange={bodyFontPicker.onChange}
                                        filter={bodyFontPicker.filter}
                                        onFilterChange={bodyFontPicker.onFilterChange}
                                    />
                                </Form.Group>
                            )}
                            {headingFontPicker && (
                                <Form.Group className="training-controls-font" controlId="global-font-family-heading">
                                    <Form.Label>{noTranslate("Heading font")}</Form.Label>
                                    <FontPicker
                                        label="Heading"
                                        value={headingFontPicker.value}
                                        onChange={headingFontPicker.onChange}
                                        filter={headingFontPicker.filter}
                                        onFilterChange={headingFontPicker.onFilterChange}
                                    />
                                </Form.Group>
                            )}
                            {kanjiFontPicker && (
                                <Form.Group className="training-controls-font" controlId="global-font-family-kanji">
                                    <Form.Label>{noTranslate("Kanji font")}</Form.Label>
                                    <FontPicker
                                        label="Kanji"
                                        value={kanjiFontPicker.value}
                                        onChange={kanjiFontPicker.onChange}
                                        filter={kanjiFontPicker.filter}
                                        onFilterChange={kanjiFontPicker.onFilterChange}
                                    />
                                </Form.Group>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal show={showIntro} onHide={() => undefined} centered backdrop="static" keyboard={false}>
                <Modal.Header>
                    <Modal.Title>{translator.translate("Dojo-läge")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {translator.translate("Förenklar träningsvyn och håller, när enheten stöder det, skärmen vaken medan du tränar.")}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={dismissIntro}>{noTranslate("OK")}</Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default TrainingControls;
