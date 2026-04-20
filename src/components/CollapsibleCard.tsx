import { useState } from "react";
import { Card } from "react-bootstrap";
import { ChevronDoubleDown, ChevronDoubleUp } from "react-bootstrap-icons";

interface Props extends React.PropsWithChildren {
    header: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    showCollapse?: boolean;
}

const CollapsibleCard = (props: Props) => {
    const { className, header, footer, showCollapse, children } = props;
    const [open, setOpen] = useState(false);

    let style = {};
    if (showCollapse ?? true)
        style = {...style, cursor: "pointer"};

    const cardClassName = `${className ?? ""} ${open ? "is-expanded" : "is-collapsed"}`.trim();

    return (
        <Card className={cardClassName}>
            <Card.Header onClick={() => setOpen(!open)} style={style}>
                <div className="collapsible-card-header">
                    <div>{header}</div>
                    {(showCollapse ?? true) && (
                    <div className="collapsible-card-chevron">
                            {open ? <ChevronDoubleUp size={13} /> : <ChevronDoubleDown size={13} />}
                        </div>
                    )}
                </div>
            </Card.Header>
            {(showCollapse ?? true) && <Card.Body style={{ display: open ? undefined : "none" }}>{children}</Card.Body>}
            {footer && <Card.Footer style={{ display: open ? undefined : "none" }}>{footer}</Card.Footer>}
        </Card>
    )
}

export default CollapsibleCard;
