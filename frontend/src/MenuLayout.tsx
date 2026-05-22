import type { PropsWithChildren } from "react";
import React from "react";

type Props = PropsWithChildren<{

}>

const MenuLayout = (props: Props) => {
    const { children } = props;
    const childItems = React.Children.toArray(children);

    return (
        <div className="d-flex flex-column justify-content-evenly align-items-center gap-3">
            {childItems.map((child, index) => <div key={index}>{child}</div>)}
        </div>
    )
}

export default MenuLayout;