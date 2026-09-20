import { useContext } from "react";
import { ArrowLeft } from "react-bootstrap-icons";
import { TranslatorContext } from "../i18n";
import { useAppBack } from "../use-app-back";

export default function BackButton({ fallback, className = "theory-back" }: { fallback: string; className?: string }) {
    const translator = useContext(TranslatorContext);
    const goBack = useAppBack(fallback);
    return <button type="button" className={className} onClick={goBack}>
        <ArrowLeft aria-hidden="true" /><span>{translator.translate("Tillbaka")}</span>
    </button>;
}
