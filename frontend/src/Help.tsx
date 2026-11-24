import { useContext, type ReactNode } from "react";
import { ArrowRight } from "react-bootstrap-icons";
import { Link } from "react-router-dom";
import BackButton from "./components/BackButton";
import CollapsibleCard from "./components/CollapsibleCard";
import { TranslatorContext } from "./i18n";
import { beginNavigation } from "./navigation-pending";
import "./components/ToolPage.css";
import "./Help.css";

function HelpSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
    return <CollapsibleCard className="help-topic" defaultOpen={defaultOpen} inlineChevron
                            header={<h2 className="app-section-heading">{title}</h2>}>
        {children}
    </CollapsibleCard>;
}

function HelpLink({ to, children }: { to: string; children: ReactNode }) {
    return <Link to={to} className="help-link" onClick={() => beginNavigation(to)}>
        {children}<ArrowRight aria-hidden="true" />
    </Link>;
}

export default function Help() {
    const translator = useContext(TranslatorContext);

    return <div className="help-page">
        <BackButton fallback="/" />
        <header className="help-header">
            <p className="app-eyebrow-heading">{translator.translate("Hjälp")}</p>
            <h1 className="app-page-heading">{translator.translate("Kom igång med appen")}</h1>
            <p className="app-intro-copy">{translator.translate("Börja med det du behöver nu. Du kan alltid återvända via Hjälp i menyn Mer.")}</p>
        </header>

        <HelpSection title={translator.translate("Namn, grad och inställningar")}>
            <p>{translator.translate("Öppna Inställningar via menyn Mer. Där väljer du ditt namn i appen och anger din nuvarande grad under Min grad.")}</p>
            <p>{translator.translate("Gradinställningen hjälper appen att välja relevanta tekniker och den veckoplan som finns i Kamokuhyō för din nästa gradering. Du kan tillfälligt visa en annan grad i träningsvyerna.")}</p>
            <p>{translator.translate("Namn och grad sparas på ditt konto och synkas mellan dina enheter när du använder samma konto och har internetanslutning.")}</p>
            <p>{translator.translate("Du kan också välja språk, textstorlek och tema i Inställningar.")}</p>
            <HelpLink to="/settings">{translator.translate("Inställningar")}</HelpLink>
        </HelpSection>

        <HelpSection title={translator.translate("Nyheter via pushnotiser")}>
            <p>{translator.translate("Slå gärna på pushnotiser för att få veta när appen uppdateras. Öppna Inställningar → Notiser och välj Aktivera notiser.")}</p>
            <p>{translator.translate("Aktivera notiser på varje enhet där du vill få dem.")}</p>
            <HelpLink to="/settings">{translator.translate("Inställningar för notiser")}</HelpLink>
        </HelpSection>

        <HelpSection title={translator.translate("Hokei – din teknikträning")}>
            <p>{translator.translate("Hokei är appens samling av tekniker att träna. Du hittar den under Träning → Hokei.")}</p>
            <p>{translator.translate("Teknikinnehållet i Hokei och veckoplanen kommer från Kamokuhyō, Shorinji Kempos kursplan. Appen hjälper dig att hitta och arbeta med det innehållet.")}</p>
            <p>{translator.translate("Öppna en teknik för att läsa detaljer, skriva egna anteckningar och göra en självskattning. Dina anteckningar och självskattningar är personliga tillägg till innehållet från Kamokuhyō.")}</p>
            <p>{translator.translate("Dina anteckningar och självskattningar sparas automatiskt och synkas mellan dina enheter när du använder samma konto och har internetanslutning.")}</p>
            <HelpLink to="/kamoku/free/hokei">{translator.translate("Hokei")}</HelpLink>
        </HelpSection>

        <HelpSection title={translator.translate("Träna med Dojo-läge")}>
            <p>{translator.translate("Dojo-läge förenklar träningsvyn så att den passar bättre under ett träningspass. När enheten stöder det hålls skärmen vaken.")}</p>
            <p>{translator.translate("Du slår på och av Dojo-läge med reglaget i en träningsvy, till exempel Veckans träning. Innehåll, anteckningar och självskattningar finns kvar när du återgår till vanligt läge.")}</p>
            <HelpLink to="/kamoku/plan">{translator.translate("Veckans träning")}</HelpLink>
        </HelpSection>

        {!translator.isJapanese && <>
            <HelpSection title={translator.translate("Quiz")}>
                <p>{translator.translate("Quiz är studiehjälp med frågor om ord, teknikgrupper, fotposition och kamae. Repetera och se vad du vill öva mer på under Teori → Quiz.")}</p>
                <HelpLink to="/quiz">{translator.translate("Quiz")}</HelpLink>
            </HelpSection>

            <HelpSection title={translator.translate("Flashkort")}>
                <p>{translator.translate("Med flashkort tänker du efter och vänder sedan kortet för att se svaret. Öva ord eller repetera Hokei med teknikdetaljer och dina egna anteckningar under Teori → Flashkort.")}</p>
                <p>{translator.translate("Tryck på kortet för att vända. Svep vänster för att öva igen eller höger om du kan det.")}</p>
                <HelpLink to="/flashcard">{translator.translate("Flashkort")}</HelpLink>
            </HelpSection>
        </>}
    </div>;
}
