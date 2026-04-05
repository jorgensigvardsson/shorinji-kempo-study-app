import { Book, Collection, Gear, House, JournalText, ListUl, type Icon } from "react-bootstrap-icons";
import type { Level } from "./data.ts";
import Kamoku from "./Kamoku.tsx";
import Settings from "./Settings.tsx";
import { type Language, type Translator } from "./i18n.ts";
import Groups from "./Groups.tsx";
import List from "./List.tsx";
import type { HokeiNotes } from "./persistence/app-data.ts";
import WordList from "./WordList.tsx";

export interface Route {
    path: string;
    component: React.ComponentType<any>;
    menuText: string;
    icon: Icon;
}

export const getRoutes = (level: Level, allLevels: Level[], translator: Translator, notesData: HokeiNotes,
                          cardTextSize: number, 
                          setLanguage: (lang: Language) => void, setLevel: (level: Level) => void,
                          setCardTextSize: (size: number) => void): Route[] => {
    let routes: Route[] = [{
        path: "/",
        component: () => <div className="p-3">Start</div>,
        menuText: translator.translate("Start"),
        icon: House
    }, {
        path: "/kamoku",
        component: () => <Kamoku myLevel={level.name} allLevels={allLevels} notesData={notesData}/>,
        menuText: translator.translate("Kamoku"),
        icon: Book
    }, {
        path: "/list",
        component: () => <List allLevels={allLevels} notesData={notesData} level={level}/>,
        menuText: translator.translate("Lista"),
        icon: ListUl
    }, {
        path: "/groups",
        component: () => <Groups allLevels={allLevels} notesData={notesData}/>,
        menuText: translator.translate("Grupper"),
        icon: Collection
    }, {
        path: "/word-list",
        component: () => <WordList />,
        menuText: translator.translate("Ordlista"),
        icon: JournalText
    }, {
        path: "/settings",
        component: () => <Settings onSetLanguage={setLanguage} onSetLevel={setLevel} level={level} levels={allLevels} translator={translator}
                                   cardTextSize={cardTextSize} onSetCardTextSize={setCardTextSize} />,
        menuText: translator.translate("Inställningar"),
        icon: Gear
    }];

    return routes;
};