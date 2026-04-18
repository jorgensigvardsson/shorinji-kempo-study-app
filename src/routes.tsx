import { Book, Collection, Gear, House, JournalText, ListUl, CardHeading, type Icon, QuestionSquare } from "react-bootstrap-icons";
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
import Flashcard from "./Flashcard.tsx";

export interface Route {
    path: string;
    component: React.ComponentType<any>;
    menuText: string | (() => string);
    icon: Icon;
    showInMainMenu?: boolean;
}

export const routeText = (route: Route) => { 
    return typeof(route.menuText) === "function" ? route.menuText() : route.menuText;
}

export const getRoutes = (gradePlan: GradePlan, allGradePlans: GradePlan[], translator: Translator, notesData: HokeiNotes,
                          textSize: number, 
                          setLanguage: (lang: Language) => void, setGrade: (grade: GradePlan) => void,
                          setTextSize: (size: number) => void): Route[] => {
    let routes: Route[] = [{
        path: "/",
        component: () => <Start/>,
        menuText: translator.translate("Start"),
        icon: House,
        showInMainMenu: true
    }, {
        path: "/kamoku",
        component: () => <Kamoku myGrade={gradePlan.grade} allGradePlans={allGradePlans} notesData={notesData}/>,
        menuText: translator.translate("Kamoku"),
        icon: Book,
        showInMainMenu: true
    }, {
        path: "/list",
        component: () => <List allGradePlans={allGradePlans} notesData={notesData} grade={gradePlan}/>,
        menuText: translator.translate("Alla hokei"),
        icon: ListUl,
        showInMainMenu: true
    }, {
        path: "/groups",
        component: () => <Groups allGradePlans={allGradePlans} notesData={notesData}/>,
        menuText: translator.translate("Teknikgrupper"),
        icon: Collection,
        showInMainMenu: true
    }, {
        path: "/word-list",
        component: () => <WordList />,
        menuText: translator.translate("Ordlista"),
        icon: JournalText
    }, {
        path: "/quiz",
        component: () => <Quiz myGrade={gradePlan.grade}/>,
        menuText: translator.translate("Quiz"),
        icon: QuestionSquare
    }, {
        path: "/flashcard",
        component: () => <Flashcard />,
        menuText: translator.translate("Flashkort"),
        icon: CardHeading
    }, {
        path: "/settings",
        component: () => <Settings onSetLanguage={setLanguage} onSetGrade={setGrade} grade={gradePlan} allGradePlans={allGradePlans} translator={translator}
                                   textSize={textSize} onSetTextSize={setTextSize} />,
        menuText: translator.translate("Inställningar"),
        icon: Gear
    }];

    return routes;
};
