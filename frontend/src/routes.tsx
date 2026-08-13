import { Award, Book, Collection, Envelope, FileEarmarkText, Gear, House, JournalText, ListUl, CardHeading, Megaphone, Newspaper, People, type Icon, QuestionSquare, ShieldCheck } from "react-bootstrap-icons";
import { Navigate } from "react-router-dom";
import type { GradePlan } from "./data.ts";
import Training, { TrainingToolPage } from "./Training.tsx";
import Settings from "./Settings.tsx";
import Broadcast from "./Broadcast.tsx";
import AdminUsers from "./AdminUsers.tsx";
import { getSyncManager } from "./sync/manager.ts";
import type { Language, Translator } from "./i18n.ts";
import Groups from "./Groups.tsx";
import type { HokeiNotes, HokeiRanks } from "./persistence/app-data.ts";
import WordList from "./WordList.tsx";
import Start from "./Start.tsx";
import Quiz from "./Quiz.tsx";
import GradingTest from "./GradingTest.tsx";
import Flashcard from "./Flashcard.tsx";
import TermsOfServices from "./TermsOfServices.tsx";
import PrivacyPolicy from "./PrivacyPolicy.tsx";
import Changelog from "./Changelog.tsx";
import Theory, { TheoryToolPage } from "./Theory.tsx";
import Feedback from "./Feedback.tsx";

export interface Route {
    path?: string;
    component?: React.ComponentType;
    href?: string;
    menuText: string | (() => string);
    startDescription?: string | (() => string);
    icon: Icon;
    showInMainMenu?: boolean;
    hideOnStartPage?: boolean;
    hideFromMenu?: boolean;
}

export const routeText = (route: Route) => { 
    return typeof(route.menuText) === "function" ? route.menuText() : route.menuText;
}

export const routeDescription = (route: Route) => {
    if (!route.startDescription)
        return undefined;

    return typeof(route.startDescription) === "function" ? route.startDescription() : route.startDescription;
}

export const getRoutes = (gradePlan: GradePlan, profileGradePlan: GradePlan, allGradePlans: GradePlan[], translator: Translator, notesData: HokeiNotes, ranksData: HokeiRanks,
                          textSize: number,
                          setLanguage: (lang: Language) => void, setGrade: (grade: GradePlan) => void,
                          setTextSize: (size: number) => void, trainingMode: boolean): Route[] => {
    const routes: Route[] = [{
        path: "/",
        component: () => <Start routes={routes.filter(r => r.path && r.path !== "/" && !r.hideOnStartPage)
                                              .map(r => ({ path: r.path!, title: routeText(r), description: routeDescription(r), icon: r.icon }))} />,
        menuText: translator.translate("Start"),
        icon: House,
        showInMainMenu: true
    }, {
        path: "/kamoku",
        component: () => <Training myGrade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} dojoMode={trainingMode}/>,
        menuText: translator.translate("Träning"),
        startDescription: translator.translate("Välj mellan veckans träning och fri träning."),
        icon: Book,
        showInMainMenu: true
    }, {
        path: "/theory",
        component: () => <Theory showLanguageTools={!translator.isJapanese} />,
        menuText: translator.translate("Teori"),
        startDescription: translator.translate("Studera ord och begrepp i lugn takt."),
        icon: JournalText,
        showInMainMenu: true,
    }, {
        path: "/list",
        component: () => <Navigate to="/kamoku?view=free&area=hokei" replace />,
        menuText: translator.translate("Alla hokei"),
        startDescription: translator.translate("Bläddra bland alla hokei och filtrera på nivå."),
        icon: ListUl,
        hideOnStartPage: true,
        hideFromMenu: true
    }, {
        path: "/theory/groups",
        component: () => <TheoryToolPage><Groups allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData}/></TheoryToolPage>,
        menuText: translator.translate("Teknikgrupper"),
        startDescription: translator.translate("Utforska tekniker grupperade efter teknikgrupp."),
        icon: Collection,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, {
        path: "/theory/grading",
        component: () => <TheoryToolPage><GradingTest subject="theory" grade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} /></TheoryToolPage>,
        menuText: translator.translate("Gradering"),
        startDescription: translator.translate("Se krav inför nästa gradering."),
        icon: Award,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, {
        path: "/training/grading",
        component: () => <TrainingToolPage><GradingTest subject="technical" grade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData} ranksData={ranksData} dojoMode={trainingMode} /></TrainingToolPage>,
        menuText: translator.translate("Gradering"),
        startDescription: translator.translate("Se krav inför nästa gradering."),
        icon: Award,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, ...(!translator.isJapanese ? [{
        path: "/word-list",
        component: () => <TheoryToolPage><WordList /></TheoryToolPage>,
        menuText: translator.translate("Ordlista"),
        startDescription: translator.translate("Slå upp ord på kanji, romaji och betydelse."),
        icon: JournalText,
        hideOnStartPage: true,
        hideFromMenu: true,
    } satisfies Route] : []), {
        path: "/quiz",
        component: () => <TheoryToolPage><Quiz myGrade={profileGradePlan.grade}/></TheoryToolPage>,
        menuText: translator.translate("Quiz"),
        startDescription: translator.translate("Svara på frågor och repetera tekniknamn i tempo."),
        icon: QuestionSquare,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, ...(!translator.isJapanese ? [{
        path: "/flashcard",
        component: () => <TheoryToolPage><Flashcard /></TheoryToolPage>,
        menuText: translator.translate("Flashkort"),
        startDescription: translator.translate("Öva med kort och bygg minnet steg för steg."),
        icon: CardHeading,
        hideOnStartPage: true,
        hideFromMenu: true,
    } satisfies Route] : []), {
        path: "/settings",
        component: () => <Settings onSetLanguage={setLanguage} onSetGrade={setGrade} nextGrade={profileGradePlan} allGradePlans={allGradePlans} translator={translator}
                                   textSize={textSize} onSetTextSize={setTextSize} />,
        menuText: translator.translate("Inställningar"),
        startDescription: translator.translate("Anpassa språk, tema, textstorlek och grad."),
        icon: Gear
    }, ...(getSyncManager().getBackendUserInfo()?.roles.includes("admin") ? [{
        path: "/admin/users",
        component: () => <AdminUsers />,
        menuText: translator.translate("Användare"),
        icon: People,
        hideOnStartPage: true,
    } satisfies Route, {
        path: "/broadcast",
        component: () => <Broadcast />,
        menuText: translator.translate("Skicka notis till alla"),
        icon: Megaphone,
        hideOnStartPage: true,
    } satisfies Route] : []), {
        path: "/changelog",
        component: () => <Changelog />,
        menuText: translator.translate("Nyheter"),
        icon: Newspaper,
        hideOnStartPage: true,
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
        path: "/feedback",
        component: () => <Feedback />,
        menuText: translator.translate("Skicka feedback"),
        icon: Envelope,
        hideOnStartPage: true
    }];

    return routes;
};
