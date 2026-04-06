import { Form } from "react-bootstrap";
import { useTheme } from "./hooks";
import type { Language, Translator } from "./i18n";
import { humanGradeName, type GradePlan, type GradeName } from "./data";
import { DefaultCardSettings } from "./persistence/card-settings";

interface Props {
    translator: Translator;
    grade: GradePlan;
    allGradePlans: GradePlan[];
    cardTextSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetGrade: (grade: GradePlan) => void;
    onSetCardTextSize: (cardTextSize: number) => void;
}

const Settings = (props: Props) => {
    const { translator, grade, allGradePlans, cardTextSize, onSetLanguage, onSetGrade, onSetCardTextSize } = props;
    const { theme, setTheme } = useTheme();

    const gradeLabel = (name: GradeName) => {
        let humanName = humanGradeName(name);
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
                <Form.Select onChange={e => onSetGrade(allGradePlans.find(x => x.grade === e.target.value)!)} value={grade.grade}>
                    {
                        allGradePlans.map(
                            (l, i) => <option value={l.grade} key={i}>{gradeLabel(l.grade)}</option>
                        )
                    }
                </Form.Select>
            </Form.Group>
        </Form>
    )
}

export default Settings;