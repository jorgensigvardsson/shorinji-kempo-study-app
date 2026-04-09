import MenuLayout from "./MenuLayout";
import NavButton from "./NavButton";
import { TranslatorContext } from "./i18n";
import { useContext } from "react";

const Start = () => {
    const translator = useContext(TranslatorContext);
    
    return (
        <MenuLayout>
            <h1>{translator.translate("Vad vill du göra idag?")}</h1>
            <NavButton to="/flash-cards">{translator.translate("Flash Cards")}</NavButton>
        </MenuLayout>
    )
}

export default Start;