import { Check2 } from "react-bootstrap-icons";
import "./CompletionMark.css";

const CompletionMark = ({ completed, className = "" }: { completed: boolean; className?: string }) => (
    <span
        className={`app-completion-mark${completed ? " is-complete" : ""}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
    >
        {completed && <Check2 />}
    </span>
);

export default CompletionMark;
