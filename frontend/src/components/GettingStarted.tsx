import { useContext, useId, useState } from "react";
import { Button, CloseButton, Modal } from "react-bootstrap";
import { ArrowRight } from "react-bootstrap-icons";
import { Link } from "react-router-dom";
import { BrowserStateScope, useBrowserState } from "../browser-state";
import { TranslatorContext } from "../i18n";
import { beginNavigation } from "../navigation-pending";
import "./GettingStarted.css";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export default function GettingStarted() {
    const translator = useContext(TranslatorContext);
    const account = useContext(BrowserStateScope);
    // This is a browser/account preference, separate from the synced study data.
    const [dismissed, setDismissed] = useBrowserState("getting-started-dismissed", false, isBoolean, true);
    const [showNotice, setShowNotice] = useState(false);
    const titleId = useId();
    const noticeId = useId();

    return <>
        {account !== "preview" && !dismissed && (
            <aside className="getting-started" aria-labelledby={titleId}>
                <CloseButton
                    className="getting-started-close"
                    aria-label={translator.translate("Ta bort Kom igång från startsidan")}
                    onClick={() => { setDismissed(true); setShowNotice(true); }}
                />
                <h2 id={titleId} className="app-section-heading">{translator.translate("Kom igång med appen")}</h2>
                <p>{translator.translate("Börja med namn och grad. Hitta din teknikträning och lär känna Dojo-läget. Aktivera gärna pushnotiser för nyheter om appen.")}</p>
                <Link to="/help" className="btn btn-primary getting-started-link" onClick={() => beginNavigation("/help")}>
                    {translator.translate("Öppna guiden")}<ArrowRight aria-hidden="true" />
                </Link>
            </aside>
        )}
        <Modal show={showNotice} onHide={() => setShowNotice(false)} centered aria-labelledby={noticeId}>
            <Modal.Header>
                <Modal.Title as="h2" id={noticeId}>{translator.translate("Hjälpen finns kvar")}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {translator.translate("Öppna menyn Mer och välj Hjälp när du vill läsa guiden igen.")}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={() => setShowNotice(false)}>{translator.translate("OK")}</Button>
            </Modal.Footer>
        </Modal>
    </>;
}
