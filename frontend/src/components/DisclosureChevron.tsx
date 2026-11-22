import { ChevronDown } from "react-bootstrap-icons";
import "./DisclosureChevron.css";

const DisclosureChevron = ({ expanded, className = "" }: { expanded: boolean; className?: string }) => (
    <ChevronDown
        className={`app-disclosure-chevron${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
    />
);

export default DisclosureChevron;
