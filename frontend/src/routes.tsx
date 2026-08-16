import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Award, Book, Collection, Envelope, FileEarmarkText, Gear, House, JournalText, CardHeading, Megaphone, Newspaper, People, type Icon, QuestionSquare, ShieldCheck } from "react-bootstrap-icons";
import type { GradePlan } from "./data.ts";
import { getSyncManager } from "./sync/manager.ts";
import type { Language, Translator } from "./i18n.ts";
import Start from "./Start.tsx";
import { TheoryToolPage, TrainingToolPage } from "./components/ToolPage.tsx";

// Every page but the start screen is loaded on first navigation to it. The start
// screen stays in the entry chunk because it is what the app opens on, and the two
// tool-page frames stay because they are the shell the lazy tools arrive inside.
// This is where most of the bundle went: the training area, the grading requirements
// and the word list each carry a large JSON file that only their own page reads.
const pageLoaders: Array<() => Promise<unknown>> = [];

const page = <T,>(load: () => Promise<{ default: ComponentType<T> }>): LazyExoticComponent<ComponentType<T>> => {
    pageLoaders.push(load);
    return lazy(load);
};

// Fetches every page's chunk without rendering any of them. React Router runs a
// navigation as a transition, which means it keeps the current page on screen
// instead of showing the Suspense fallback — so a page that has not arrived yet
// looks like a tap that did nothing rather than like something loading. Calling
// this once the app is idle closes that window for every way of navigating at
// once, rather than each link having to remember to prefetch its own target.
//
// It costs no extra traffic: the service worker precaches all of these anyway,
// moments later. This only makes the timing predictable, and covers the first
// visit, when there is no service worker in control yet.
// Resolves once every page is in hand. Nothing in the app waits on it — the return
// value is there so a test can assert that each registered loader points at a module
// that really loads.
export const preloadPages = (): Promise<unknown[]> => Promise.all(pageLoaders.map(load => load()));

const Training = page(() => import("./Training.tsx"));
const Settings = page(() => import("./Settings.tsx"));
const Broadcast = page(() => import("./Broadcast.tsx"));
const AdminUsers = page(() => import("./AdminUsers.tsx"));
const Groups = page(() => import("./Groups.tsx"));
const WordList = page(() => import("./WordList.tsx"));
const Quiz = page(() => import("./Quiz.tsx"));
const GradingTest = page(() => import("./GradingTest.tsx"));
const Flashcard = page(() => import("./Flashcard.tsx"));
const TermsOfServices = page(() => import("./TermsOfServices.tsx"));
const PrivacyPolicy = page(() => import("./PrivacyPolicy.tsx"));
const Changelog = page(() => import("./Changelog.tsx"));
const Theory = page(() => import("./Theory.tsx"));
const Feedback = page(() => import("./Feedback.tsx"));

export interface Route {
    path?: string;
    // Router pattern to register, when a section owns more paths than the single
    // one its menu entry links to (e.g. /kamoku also serves /kamoku/free/hokei).
    matchPath?: string;
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

export const getRoutes = (gradePlan: GradePlan, profileGradePlan: GradePlan, allGradePlans: GradePlan[], translator: Translator,
                          textSize: number,
                          setLanguage: (lang: Language) => void, setGrade: (grade: GradePlan) => void,
                          setTextSize: (size: number) => void, trainingMode: boolean, displayName?: string): Route[] => {
    const routes: Route[] = [{
        path: "/",
        component: () => <Start routes={routes.filter(r => r.path && r.path !== "/" && !r.hideOnStartPage)
                                              .map(r => ({ path: r.path!, title: routeText(r), description: routeDescription(r), icon: r.icon }))}
                                displayName={displayName} />,
        menuText: translator.translate("Start"),
        icon: House,
        showInMainMenu: true
    }, {
        path: "/kamoku",
        matchPath: "/kamoku/*",
        component: () => <Training myGrade={gradePlan.grade} allGradePlans={allGradePlans} dojoMode={trainingMode}/>,
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
        path: "/theory/groups",
        component: () => <TheoryToolPage><Groups allGradePlans={allGradePlans}/></TheoryToolPage>,
        menuText: translator.translate("Teknikgrupper"),
        startDescription: translator.translate("Utforska tekniker grupperade efter teknikgrupp."),
        icon: Collection,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, {
        path: "/theory/grading",
        component: () => <TheoryToolPage><GradingTest subject="theory" grade={gradePlan.grade} allGradePlans={allGradePlans} /></TheoryToolPage>,
        menuText: translator.translate("Gradering"),
        startDescription: translator.translate("Se krav inför nästa gradering."),
        icon: Award,
        hideOnStartPage: true,
        hideFromMenu: true,
    }, {
        path: "/training/grading",
        component: () => <TrainingToolPage><GradingTest subject="technical" grade={gradePlan.grade} allGradePlans={allGradePlans} dojoMode={trainingMode} /></TrainingToolPage>,
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
