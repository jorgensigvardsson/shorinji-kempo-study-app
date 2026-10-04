import { useContext, useId, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { Check2, ChevronRight } from "react-bootstrap-icons";
import type { GradeName } from "../data";
import { TranslatorContext } from "../i18n";
import { gradeLabel } from "../strings";
import { TrainingViewSettingsContext } from "../training-view-settings-context";
import { useAppData } from "../persistence/use-app-data";
import "./TrainingPageControls.css";

const DOJO_MODE_EXPLANATION_KEY = "dojo-mode-activation-intro-seen";

interface FocusChoice {
  value: string;
  label: string;
}

// One quiet line under a grade picker's title, so the reader choosing among
// fifteen grades can see where they stand: the grade they hold and the one they
// are training towards, both as set under Settings.
const OwnGradeSummary = () => {
  const translator = useContext(TranslatorContext);
  const currentGrade = useAppData("currentGrade");
  const trainingGrade = useAppData("grade");
  return (
    <p className="training-choice-modal-subtitle">
      {translator.translate("Du är {0} · tränar inför {1}", {
        params: [gradeLabel(currentGrade, translator, false), gradeLabel(trainingGrade, translator, false)],
      })}
    </p>
  );
};

export const FocusChoicePicker = ({ title, value, onChange, choices, leadText, showOwnGrade = false, className = "" }: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  choices: FocusChoice[];
  leadText?: string;
  // Grade pickers turn this on; the picker itself does not know what it lists.
  showOwnGrade?: boolean;
  className?: string;
}) => {
  const translator = useContext(TranslatorContext);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const selected = choices.find(choice => choice.value === value) ?? choices[0];

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`training-choice-trigger ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span>{leadText ?? translator.translate("Visar")}</span>
        <strong>{selected?.label}</strong>
        <ChevronRight aria-hidden="true" />
      </button>
      <Modal show={open} onHide={() => setOpen(false)} fullscreen aria-labelledby={titleId}>
        <Modal.Header closeButton className="training-choice-modal-header">
          <div>
            <Modal.Title as="h2" id={titleId}>{title}</Modal.Title>
            {showOwnGrade && <OwnGradeSummary />}
          </div>
        </Modal.Header>
        <Modal.Body className="training-choice-modal-body">
          <div className="training-choice-list">
            {choices.map(choice => {
              const isSelected = choice.value === value;
              return (
                <button
                  type="button"
                  key={choice.value}
                  className={`training-choice-option${isSelected ? " is-selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => choose(choice.value)}
                >
                  <span>{choice.label}</span>
                  {isSelected && <Check2 aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
};

const DojoModeToggle = ({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) => {
  const translator = useContext(TranslatorContext);
  const id = useId();
  const [showExplanation, setShowExplanation] = useState(false);

  const requestChange = (next: boolean) => {
    if (!next || localStorage.getItem(DOJO_MODE_EXPLANATION_KEY) === "true") {
      onChange(next);
      return;
    }
    setShowExplanation(true);
  };

  const activate = () => {
    localStorage.setItem(DOJO_MODE_EXPLANATION_KEY, "true");
    setShowExplanation(false);
    onChange(true);
  };

  return (
    <>
      <Form.Check
        type="switch"
        id={id}
        className="training-dojo-toggle"
        label={translator.translate("Dojo-läge")}
        checked={active}
        onChange={event => requestChange(event.target.checked)}
      />
      <Modal show={showExplanation} onHide={() => setShowExplanation(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{translator.translate("Dojo-läge")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {translator.translate("Förenklar träningsvyn och håller, när enheten stöder det, skärmen vaken medan du tränar.")}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowExplanation(false)}>
            {translator.translate("Avbryt")}
          </Button>
          <Button onClick={activate}>{translator.translate("Aktivera")}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

const TrainingPageControls = ({ showGrade = false, showDojo = false, className = "" }: {
  showGrade?: boolean;
  showDojo?: boolean;
  className?: string;
}) => {
  const translator = useContext(TranslatorContext);
  const settings = useContext(TrainingViewSettingsContext);
  if (!settings || (!showGrade && !showDojo)) return null;

  const gradeChoices = settings.gradePlans.map(plan => ({
    value: plan.grade,
    label: gradeLabel(plan.grade, translator, false),
  }));

  return (
    <div className={`training-page-controls ${className}`.trim()}>
      {showGrade && (
        <FocusChoicePicker
          title={translator.translate("Välj grad")}
          showOwnGrade
          value={settings.grade}
          choices={gradeChoices}
          onChange={value => settings.onGradeChange(value as GradeName)}
        />
      )}
      {showDojo && <DojoModeToggle active={settings.dojoMode} onChange={settings.onDojoModeChange} />}
    </div>
  );
};

export default TrainingPageControls;
