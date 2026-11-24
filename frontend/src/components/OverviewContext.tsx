import { useContext, type ReactNode } from "react";
import { TranslatorContext } from "../i18n";
import "./OverviewContext.css";

// Home shows its greeting above the heading. Training and Theory use a shorter
// row: room for desktop back buttons, or breathing space below the mobile brand.
export default function OverviewContext({ displayName, greetingVisible = false, children }: {
    displayName?: string;
    greetingVisible?: boolean;
    children?: ReactNode;
}) {
    const translator = useContext(TranslatorContext);
    const name = displayName?.trim();
    const greeting = name
        ? `${translator.translate("Gasshō")}, ${name}`
        : translator.translate("Gasshō");

    return (
        <div className={`overview-context${greetingVisible ? " start-context" : ""}`}
             aria-label={greetingVisible ? greeting : undefined}>
            <span className={greetingVisible ? undefined : "overview-context-spacer"}
                  aria-hidden={greetingVisible ? undefined : true}>{greeting}</span>
            {children && <div className="overview-context-action">{children}</div>}
        </div>
    );
}
