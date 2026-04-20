import { type ComponentType } from "react";
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
    const navigate = useNavigate();

    const items: GridItem[] = routes.map((route) => ({
        key: route.path,
        title: route.title,
        subtitle: route.description,
        icon: <route.icon size={20} />,
        onSelect: () => navigate(route.path),
    }));

    return (
        <div>
            <Grid items={items} />
        </div>
    );
};

export default Start;
