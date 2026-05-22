import { useContext, type ComponentType } from "react";
import { useNavigate } from "react-router";
import { Card } from "react-bootstrap";
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
        <div>
            <Card className="app-grid-panel mb-2">
                <Card.Body>
                    <h2>{translator.translate("Vad vill du göra idag?")}</h2>
                </Card.Body>
            </Card>
            <Grid items={items} />
        </div>
    );
};

export default Start;
