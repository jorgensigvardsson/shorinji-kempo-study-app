import { ChevronRight } from "react-bootstrap-icons";
import "./DisclosureChevron.css";

const DisclosureChevron = ({ expanded, className = "" }: { expanded: boolean; className?: string }) => (
    <ChevronRight
        className={`app-disclosure-chevron${expanded ? " is-expanded" : ""}${className ? ` ${className}` : ""}`}
        aria-hidden="true"
    />
);

export default DisclosureChevron;
