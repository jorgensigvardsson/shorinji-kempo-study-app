import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { HokeiRankValue } from "../persistence/schema";
import "./StarRating.css";

interface Props {
  value: HokeiRankValue | null;
  onChange: (value: HokeiRankValue | null) => void;
  groupLabel: string;
  emptyLabel: string;
  getLabel: (value: HokeiRankValue) => string;
}

const ASSESSMENT_VALUES: Array<HokeiRankValue | null> = [null, 1, 2, 3];

const StarRating = ({ value, onChange, groupLabel, emptyLabel, getLabel }: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel = value === null ? emptyLabel : getLabel(value);
  const stopHeaderToggle = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="self-assessment" role="group" aria-label={groupLabel} ref={rootRef}>
      <button
        type="button"
        className="self-assessment-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${groupLabel}: ${currentLabel}`}
        onMouseDown={stopHeaderToggle}
        onClick={event => {
          stopHeaderToggle(event);
          setOpen(current => !current);
        }}
      >
        <span className={`self-assessment-dot value-${value ?? "none"}`} aria-hidden="true" />
        <span>{currentLabel}</span>
      </button>
      {open && (
        <div className="self-assessment-menu" role="radiogroup" aria-label={groupLabel}>
          {ASSESSMENT_VALUES.map(assessmentValue => {
            const label = assessmentValue === null ? emptyLabel : getLabel(assessmentValue);
            return (
          <button
            key={assessmentValue ?? "none"}
            type="button"
            className="self-assessment-option"
            onMouseDown={stopHeaderToggle}
            onClick={(event) => {
              stopHeaderToggle(event);
              onChange(assessmentValue);
              setOpen(false);
            }}
            role="radio"
            aria-checked={value === assessmentValue}
          >
            <span className={`self-assessment-dot value-${assessmentValue ?? "none"}`} aria-hidden="true" />
            <span>{label}</span>
          </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StarRating;
