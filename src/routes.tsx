import { Book, Collection, Envelope, FileEarmarkText, Gear, House, JournalText, ListUl, CardHeading, type Icon, QuestionSquare, ShieldCheck } from "react-bootstrap-icons";
import type { GradePlan } from "./data.ts";
import Kamoku from "./Kamoku.tsx";
import Settings from "./Settings.tsx";
import { noTranslate, type Language, type Translator } from "./i18n.ts";
import Groups from "./Groups.tsx";
import List from "./List.tsx";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data.ts";
import WordList from "./WordList.tsx";
import Start from "./Start.tsx";
import Quiz from "./Quiz.tsx";
import Flashcard from "./Flashcard.tsx";
import TermsOfServices from "./TermsOfServices.tsx";
import PrivacyPolicy from "./PrivacyPolicy.tsx";

export interface Route {
    path?: string;
    component?: React.ComponentType<any>;
    href?: string;
    menuText: string | (() => string);
    startDescription?: string | (() => string);
    icon: Icon;
    showInMainMenu?: boolean;
    hideOnStartPage?: boolean;
}

export const routeText = (route: Route) => { 
    return typeof(route.menuText) === "function" ? route.menuText() : route.menuText;
}

export const routeDescription = (route: Route) => {
    if (!route.startDescription)
        return undefined;

    return typeof(route.startDescription) === "function" ? route.startDescription() : route.startDescription;
}

export const getRoutes = (gradePlan: GradePlan, allGradePlans: GradePlan[], translator: Translator, notesData: HokeiNotes, ranksData: HokeiRanks,
                          textSize: number, 
                          setLanguage: (lang: Language) => void, setGrade: (grade: GradePlan) => void,
                          setTextSize: (size: number) => void): Route[] => {
    let routes: Route[] = [{
        path: "/",
        component: () => <Start routes={routes.filter(r => r.path !== "/" && !r.hideOnStartPage)
                                              .map(r => ({ path: r.path, title: routeText(r), description: routeDescription(r), icon: r.icon }))} />,
        menuText: translator.translate("Start"),
        icon: House,
        showInMainMenu: true
    }, {
        path: "/kamoku",
        component: () => <Kamoku myGrade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData}/>,
        menuText: translator.translate("Kamoku"),
        startDescription: translator.translate("Träna veckans innehåll utifrån din grad."),
        icon: Book,
        showInMainMenu: true
    }, {
        path: "/list",
        component: () => <List allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} grade={gradePlan}/>,
        menuText: translator.translate("Alla hokei"),
        startDescription: translator.translate("Bläddra bland alla hokei och filtrera på nivå."),
        icon: ListUl,
        showInMainMenu: true
    }, {
        path: "/groups",
        component: () => <Groups allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData}/>,
        menuText: translator.translate("Teknikgrupper"),
        startDescription: translator.translate("Utforska tekniker grupperade efter teknikgrupp."),
        icon: Collection,
        showInMainMenu: true
    }, {
        path: "/word-list",
        component: () => <WordList />,
        menuText: translator.translate("Ordlista"),
        startDescription: translator.translate("Slå upp ord på kanji, romaji och betydelse."),
        icon: JournalText
    }, {
        path: "/quiz",
        component: () => <Quiz myGrade={gradePlan.grade}/>,
        menuText: translator.translate("Quiz"),
        startDescription: translator.translate("Svara på frågor och repetera tekniknamn i tempo."),
        icon: QuestionSquare
    }, ...(!translator.isJapanese ? [{
        path: "/flashcard",
        component: () => <Flashcard />,
        menuText: translator.translate("Flashkort"),
        startDescription: translator.translate("Öva med kort och bygg minnet steg för steg."),
        icon: CardHeading
    } satisfies Route] : []), {
        path: "/settings",
        component: () => <Settings onSetLanguage={setLanguage} onSetGrade={setGrade} grade={gradePlan} allGradePlans={allGradePlans} translator={translator}
                                   textSize={textSize} onSetTextSize={setTextSize} />,
        menuText: translator.translate("Inställningar"),
        startDescription: translator.translate("Anpassa språk, tema, textstorlek och grad."),
        icon: Gear
    }, {
        path: "/terms-of-service",
        component: () => <TermsOfServices />,
        menuText: translator.translate("Användarvillkor"),
        startDescription: translator.translate("Läs villkoren för hur appen används."),
        icon: FileEarmarkText,
        hideOnStartPage: true
    }, {
        path: "/privacy-policy",
        component: () => <PrivacyPolicy />,
        menuText: translator.translate("Integritetspolicy"),
        startDescription: translator.translate("Se hur appen hanterar dina uppgifter."),
        icon: ShieldCheck,
        hideOnStartPage: true
    }, {
        href: `mailto:${import.meta.env.VITE_FEEDBACK_EMAIL}?subject=${encodeURIComponent(noTranslate("App feedback"))}&body=${encodeURIComponent(noTranslate("Hi!\n\nMy feedback:"))}`,
        menuText: translator.translate("Skicka feedback"),
        icon: Envelope,
        hideOnStartPage: true
    }];

    return routes;
};
