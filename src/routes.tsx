import { Book, Collection, Gear, House, JournalText, ListUl, CardHeading, type Icon } from "react-bootstrap-icons";
import type { GradePlan } from "./data.ts";
import Kamoku from "./Kamoku.tsx";
import Settings from "./Settings.tsx";
import { type Language, type Translator } from "./i18n.ts";
import Groups from "./Groups.tsx";
import List from "./List.tsx";
import type { HokeiNotes } from "./persistence/app-data.ts";
import WordList from "./WordList.tsx";
import Start from "./Start.tsx";
import Quiz from "./Quiz.tsx";

export interface Route {
    path: string;
    component: React.ComponentType<any>;
    menuText: string | (() => string);
    icon: Icon;
}

export const routeText = (route: Route) => { 
    return typeof(route.menuText) === "function" ? route.menuText() : route.menuText;
}

export const getRoutes = (gradePlan: GradePlan, allGradePlans: GradePlan[], translator: Translator, notesData: HokeiNotes,
                          cardTextSize: number, 
                          setLanguage: (lang: Language) => void, setGrade: (grade: GradePlan) => void,
                          setCardTextSize: (size: number) => void): Route[] => {
    let routes: Route[] = [{
        path: "/",
        component: () => <Start/>,
        menuText: translator.translate("Start"),
        icon: House
    }, {
        path: "/kamoku",
        component: () => <Kamoku myGrade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData}/>,
        menuText: translator.translate("Kamoku"),
        icon: Book
    }, {
        path: "/list",
        component: () => <List allGradePlans={allGradePlans} notesData={notesData} grade={gradePlan}/>,
        menuText: translator.translate("Lista"),
        icon: ListUl
    }, {
        path: "/groups",
        component: () => <Groups allGradePlans={allGradePlans} notesData={notesData}/>,
        menuText: translator.translate("Grupper"),
        icon: Collection
    }, {
        path: "/word-list",
        component: () => <WordList />,
        menuText: translator.translate("Ordlista"),
        icon: JournalText
    }, {
        path: "/settings",
        component: () => <Settings onSetLanguage={setLanguage} onSetGrade={setGrade} grade={gradePlan} allGradePlans={allGradePlans} translator={translator}
                                   cardTextSize={cardTextSize} onSetCardTextSize={setCardTextSize} />,
        menuText: translator.translate("Inställningar"),
        icon: Gear
    }, {
        path: "/flash-cards",
        component: () => <Quiz />,
        menuText: translator.translate("Quiz"),
        icon: CardHeading
    }];

    return routes;
};