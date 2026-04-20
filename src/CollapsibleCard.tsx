import { useState } from "react";
import { Card } from "react-bootstrap";
import { ArrowsCollapse, ArrowsExpand } from "react-bootstrap-icons";

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

    return (
        <Card className={className}>
            <Card.Header onClick={() => setOpen(!open)} style={style}>
                {
                    (showCollapse ?? true) ?
                    <div style={{display: "grid", gridTemplateColumns: "1fr 1em"}}>
                        <div>{header}</div>
                        <div style={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                            <ArrowsExpand style={{ display: open ? "none" : undefined }}/>
                            <ArrowsCollapse style={{ display: open ? undefined : "none" }}/>
                        </div>
                    </div>
                    : <div>{header}</div>
                }
            </Card.Header>
            {(showCollapse ?? true) && <Card.Body style={{ display: open ? undefined : "none" }}>{children}</Card.Body>}
            {footer && <Card.Footer style={{ display: open ? undefined : "none" }}>{footer}</Card.Footer>}
        </Card>
    )
}

export default CollapsibleCard;