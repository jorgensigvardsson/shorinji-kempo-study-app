import { Form } from "react-bootstrap";
import { useTheme } from "./hooks";
import type { Language, Translator } from "./i18n";
import { humanLevelName, type Level, type LevelName } from "./data";
import { DefaultCardSettings } from "./persistence/card-settings";

interface Props {
    translator: Translator;
    level: Level;
    levels: Level[];
    cardTextSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetLevel: (level: Level) => void;
    onSetCardTextSize: (cardTextSize: number) => void;
}

const Settings = (props: Props) => {
    const { translator, level, levels, cardTextSize, onSetLanguage, onSetLevel, onSetCardTextSize } = props;
    const { theme, setTheme } = useTheme();

    const levelLabel = (name: LevelName) => {
        let humanName = humanLevelName(name);
        humanName = `${humanName[0].toUpperCase()}${humanName.slice(1)}`;

        if (!translator.isJapanese)
            return `${translator.translate(humanName)} (${translator.japanese(humanName)})`;

        return translator.japanese(humanName);
    }
    
    return (
        <Form className="p-3">
            <Form.Group className="mb-3" controlId="settingsTheme">
                <Form.Label>Tema</Form.Label>
                <Form.Select value={theme} onChange={e => setTheme(e.target.value as "light" | "dark" | "system")}>
                    <option value={"light"}>Ljust</option>
                    <option value={"dark"}>Mörkt</option>
                    <option value={"system"}>System</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsTheme">
                <Form.Label>Språk</Form.Label>
                <Form.Select onChange={e => onSetLanguage(e.target.value as Language)} value={translator.currentLanguage}>
                    <option value="sv">Svenska</option>
                    <option value="ja">日本語</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="cardTextSize">
                <Form.Label>Textstorlek</Form.Label>
                <Form.Select onChange={e => onSetCardTextSize(parseFloat(e.target.value))} value={cardTextSize}>
                    <option value="1.0">Liten</option>
                    <option value={DefaultCardSettings.cardTextSize}>Medium</option>
                    <option value="1.7">Stor</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsLevel">
                <Form.Label>Nivå</Form.Label>
                <Form.Select onChange={e => onSetLevel(levels.find(x => x.name === e.target.value)!)} value={level.name}>
                    {
                        levels.map(
                            (l, i) => <option value={l.name} key={i}>{levelLabel(l.name)}</option>
                        )
                    }
                </Form.Select>
            </Form.Group>
        </Form>
    )
}

export default Settings;