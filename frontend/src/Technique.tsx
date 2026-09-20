import { useContext } from "react";
import { Link, useParams } from "react-router-dom";
import type { GradePlan } from "./data";
import { techniqueCatalogue } from "./activity-search";
import { TranslatorContext } from "./i18n";
import HokeiCard from "./components/HokeiCard";
import BackButton from "./components/BackButton";

export default function Technique({ allGradePlans }: { allGradePlans: GradePlan[] }) {
    const { id } = useParams();
    const translator = useContext(TranslatorContext);
    const entry = techniqueCatalogue(allGradePlans).find(candidate => candidate.hokei.id === id);
    return <div className="theory-tool-page">
        <BackButton fallback="/search" />
        {entry ? <>
            <h1 className="app-page-heading">{translator.translate(entry.hokei.hokei_name, { capitalize: true })}</h1>
            <HokeiCard key={entry.hokei.id} hokei={entry.hokei} gradeName={entry.grade} showNotes showRating kamokuLayout defaultOpen />
        </> : <><p>{translator.translate("Tekniken kunde inte hittas.")}</p><Link to="/search">{translator.translate("Sök")}</Link></>}
    </div>;
}
