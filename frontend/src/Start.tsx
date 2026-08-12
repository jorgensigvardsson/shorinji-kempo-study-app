import { useContext, type ComponentType } from "react";
import { useNavigate } from "react-router";
import Grid, { type GridItem } from "./components/Grid";
import { TranslatorContext } from "./i18n";

interface StartRouteCard {
    path: string;
    title: string;
    description?: string;
    icon: ComponentType<{ size?: number; className?: string }>;
}

interface Props {
    routes: StartRouteCard[];
}

const Start = (props: Props) => {
    const { routes } = props;
    const navigate = useNavigate();
    const translator = useContext(TranslatorContext);

    const items: GridItem[] = routes.map((route) => ({
        key: route.path,
        title: route.title,
        subtitle: route.description,
        icon: <route.icon size={20} />,
        onSelect: () => navigate(route.path),
    }));

    return (
        <div className="start-screen">
            <header className="start-intro">
                <h1>{translator.translate("Vad vill du göra idag?")}</h1>
            </header>
            <Grid items={items} className="start-grid" />
        </div>
    );
};

export default Start;
