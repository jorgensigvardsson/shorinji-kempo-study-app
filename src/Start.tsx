import { Container } from "react-bootstrap";
import { TranslatorContext } from "./i18n";
import { type ComponentType, useContext } from "react";
import { useNavigate } from "react-router";
import Grid, { type GridItem } from "./Grid";

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
    const translator = useContext(TranslatorContext);
    const navigate = useNavigate();

    const items: GridItem[] = routes.map((route) => ({
        key: route.path,
        title: route.title,
        subtitle: route.description,
        icon: <route.icon size={20} />,
        onSelect: () => navigate(route.path),
    }));

    return (
        <Container className="p-3">
            <div className="app-grid-panel mb-3">
                <h2 className="app-grid-title mb-1">{translator.translate("Vad vill du göra idag?")}</h2>
            </div>
            <Grid items={items} />
        </Container>
    );
};

export default Start;
