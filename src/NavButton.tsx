import type { PropsWithChildren } from "react"
import { Button } from "react-bootstrap";
import { useNavigate } from "react-router";

type Props = PropsWithChildren<{
    to: string | (() => string)
}>

const NavButton = (props: Props) => {
    const { to, children } = props;
    const navigate = useNavigate();
    const link = typeof(to) === "function" ? to() : to;

    return <Button onClick={() => navigate(link)}>{children}</Button>
}

export default NavButton;