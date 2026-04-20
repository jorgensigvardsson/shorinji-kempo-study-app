import { type KeyboardEvent, type ReactNode } from "react";
import { Card } from "react-bootstrap";
import "./Grid.css";

export interface GridItem {
    key: string;
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    icon?: ReactNode;
    preview?: ReactNode;
    onSelect?: () => void;
}

interface Props {
    items: GridItem[];
    className?: string;
}

const Grid = (props: Props) => {
    const { items, className } = props;
    const gridClass = ["app-grid", className].filter(Boolean).join(" ");

    const onCardKeyDown = (event: KeyboardEvent, onSelect?: () => void) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
        }
    };

    return (
        <div className={gridClass}>
            {items.map((item) => {
                const cardClass = ["app-grid-card", item.onSelect ? "app-grid-card-interactive" : ""].filter(Boolean).join(" ");

                return (
                    <Card
                        key={item.key}
                        className={cardClass}
                        onClick={item.onSelect}
                        onKeyDown={(e) => onCardKeyDown(e, item.onSelect)}
                        role={item.onSelect ? "button" : undefined}
                        tabIndex={item.onSelect ? 0 : undefined}
                    >
                        <Card.Body>
                            <div className="app-grid-card-top">
                                <div className="app-grid-title-row">
                                    {item.icon && <span className="app-grid-icon">{item.icon}</span>}
                                    <h3 className="app-grid-title mb-0">{item.title}</h3>
                                </div>
                                {item.badge}
                            </div>
                            {item.subtitle && <div className="app-grid-subtitle">{item.subtitle}</div>}
                            {item.preview && <div className="app-grid-preview mt-3">{item.preview}</div>}
                        </Card.Body>
                    </Card>
                );
            })}
        </div>
    );
};

export default Grid;
