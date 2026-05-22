import type { MouseEvent } from "react";
import type { HokeiRankValue } from "../persistence/schema";
import "./StarRating.css";

interface Props {
  value: HokeiRankValue | null;
  onChange: (value: HokeiRankValue | null) => void;
  groupLabel: string;
  getLabel: (value: HokeiRankValue) => string;
}

const STAR_VALUES: HokeiRankValue[] = [1, 2, 3];

const StarRating = ({ value, onChange, groupLabel, getLabel }: Props) => {
  const stopHeaderToggle = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="star-rating" role="group" aria-label={groupLabel}>
      {STAR_VALUES.map((starValue) => {
        const filled = value !== null && starValue <= value;
        const label = getLabel(starValue);

        return (
          <button
            key={starValue}
            type="button"
            className="star-rating-button"
            onMouseDown={stopHeaderToggle}
            onClick={(event) => {
              stopHeaderToggle(event);
              onChange(value === starValue ? null : starValue);
            }}
            title={label}
            aria-label={label}
            aria-pressed={value === starValue}
          >
            <StarIcon filled={filled} />
          </button>
        );
      })}
    </div>
  );
};

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg className={`star-icon ${filled ? "is-filled" : "is-empty"}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2.9l2.68 5.43 5.99.87-4.33 4.22 1.02 5.96L12 16.56 6.64 19.38l1.02-5.96-4.33-4.22 5.99-.87L12 2.9z" />
  </svg>
);

export default StarRating;
