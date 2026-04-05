import { useContext } from "react";
import { TranslatorContext } from "./i18n";

interface Props {
    text: string;
}

export const Label = (props: Props) => {
    const { text } = props;
    const translator = useContext(TranslatorContext);

    const japaneseText = translator.japanese(text);
    if (translator.isJapanese)
        return <p>{japaneseText}</p>;

    return <><p>{japaneseText}</p><p>{translator.translate(text)}</p></>
}