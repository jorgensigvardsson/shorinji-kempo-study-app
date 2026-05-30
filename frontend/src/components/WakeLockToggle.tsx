import { useContext, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { LightbulbFill, LightbulbOff } from "react-bootstrap-icons";
import { TranslatorContext } from "../i18n";
import "./WakeLockToggle.css";

interface Props {
    /** Optional controlled state. When omitted, the component manages its own
     *  local state — handy while we're still feeling out the UX (no real wake
     *  lock is acquired yet). */
    active?: boolean;
    onChange?: (active: boolean) => void;
    /** "button" — a compact pill (used in the drawer on small screens).
     *  "card" — a toast-styled panel (used floating on large screens). */
    variant?: "button" | "card";
    className?: string;
}

/**
 * GUI-only "keep the screen on" toggle. This does NOT yet acquire a Screen Wake
 * Lock — it exists so we can settle on the look, placement and affordance first.
 */
const WakeLockToggle = (props: Props) => {
    const { active: controlled, onChange, variant = "button", className } = props;
    const translator = useContext(TranslatorContext);
    const [internal, setInternal] = useState(false);
    const active = controlled ?? internal;

    const toggle = () => {
        const next = !active;
        if (controlled === undefined) setInternal(next);
        onChange?.(next);
    };

    const Icon = active ? LightbulbFill : LightbulbOff;
    const title = translator.translate("Håll skärmen tänd");

    if (variant === "card") {
        return (
            <div className={`app-update-toast wake-lock-card ${className ?? ""}`}>
                <div className="app-update-toast-body">
                    <div
                        className={`app-update-toast-icon ${active ? "app-update-toast-icon--warning" : ""}`}
                        aria-hidden="true"
                    >
                        <Icon size={20} />
                    </div>
                    <div className="app-update-toast-copy">
                        <div className="app-update-toast-title">{title}</div>
                        <div className="app-update-toast-text">
                            {translator.translate("Förhindrar att skärmen släcks.")}
                        </div>
                    </div>
                    <Form.Check
                        type="switch"
                        className="wake-lock-switch app-update-toast-action"
                        checked={active}
                        onChange={toggle}
                        aria-label={title}
                    />
                </div>
            </div>
        );
    }

    const label = active
        ? translator.translate("Skärmen hålls tänd")
        : title;

    return (
        <Button
            type="button"
            variant={active ? "warning" : "outline-secondary"}
            size="sm"
            aria-pressed={active}
            onClick={toggle}
            className={`wake-lock-toggle ${className ?? ""}`}
        >
            <Icon aria-hidden="true" />
            <span>{label}</span>
        </Button>
    );
};

export default WakeLockToggle;
