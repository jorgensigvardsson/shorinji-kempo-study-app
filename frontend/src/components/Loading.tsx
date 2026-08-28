import { useContext } from "react";
import { Spinner } from "react-bootstrap";
import { TranslatorContext, type Translator } from "../i18n";
import { useLoadingPhase } from "../hooks";

interface Props {
    // What is being waited for, when saying so is more use than "Laddar…" —
    // "Hämtar ansökningar…", say.
    label?: string;
    // Whether a long wait means a backend service is starting up. True for
    // anything fetched from one of the services; false for a wait the app is
    // causing itself, such as a page chunk still on its way.
    fromService?: boolean;
    // The login screen runs on the language the visitor picked there rather than
    // on a stored one, so its translator is not the one in context.
    translator?: Translator;
    className?: string;
}

/**
 * The one thing a page shows while it waits for data.
 *
 * Both backend services scale to zero when idle, which leaves a page waiting on
 * one with two separate problems. The first is that a wait of several seconds
 * with nothing on screen reads as a page that has failed rather than as one that
 * is working; that is what the spinner is for. The second is that the wait is
 * unexplained — it happens only to whoever asks first, is over in a moment for
 * everyone after them, and looks for all the world like the app being slow. So
 * once the wait has gone past anything a running service could account for, this
 * says what is actually happening.
 *
 * Nothing is drawn for the first fraction of a second: a warm service answers
 * inside it, and an indicator that appears and disappears that fast is a flicker
 * rather than an assurance. See useLoadingPhase for the two delays.
 */
const Loading = (props: Props) => {
    const { label, fromService = true, className } = props;
    const contextTranslator = useContext(TranslatorContext);
    const translator = props.translator ?? contextTranslator;
    const phase = useLoadingPhase(true);

    if (phase === "settling") return null;

    return (
        <div className={`d-flex align-items-center gap-2${className ? ` ${className}` : ""}`} role="status">
            {/* The visible text is the status; the spinner beside it would only be
                read out as a second, empty one. */}
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <div>
                <div>{label ?? translator.translate("Laddar…")}</div>
                {fromService && phase === "cold" && (
                    <div className="text-body-secondary small">
                        {translator.translate("Servern startar. Det kan ta en stund.")}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Loading;
