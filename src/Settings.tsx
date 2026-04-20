import { Form } from "react-bootstrap";
import { useTheme } from "./hooks";
import type { Language, Translator } from "./i18n";
import { humanGradeName, type GradePlan, type GradeName } from "./data";
import { DefaultTextSize } from "./persistence/text-size";

interface Props {
    translator: Translator;
    grade: GradePlan;
    allGradePlans: GradePlan[];
    textSize: number;
    onSetLanguage: (lang: Language) => void;
    onSetGrade: (grade: GradePlan) => void;
    onSetTextSize: (textSize: number) => void;
}

const Settings = (props: Props) => {
    const { translator, grade, allGradePlans, textSize, onSetLanguage, onSetGrade, onSetTextSize } = props;
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
                <Form.Label>{translator.translate("Tema")}</Form.Label>
                <Form.Select value={theme} onChange={e => setTheme(e.target.value as "light" | "dark" | "system")}>
                    <option value={"light"}>{translator.translate("Ljust")}</option>
                    <option value={"dark"}>{translator.translate("Mörkt")}</option>
                    <option value={"system"}>{translator.translate("System")}</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsTheme">
                <Form.Label>{translator.translate("Språk")}</Form.Label>
                <Form.Select onChange={e => onSetLanguage(e.target.value as Language)} value={translator.currentLanguage}>
                    <option value="sv">{translator.translate("Svenska")}</option>
                    <option value="ja">{translator.translate("Japanska")}</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="textSize">
                <Form.Label>{translator.translate("Textstorlek")}</Form.Label>
                <Form.Select onChange={e => onSetTextSize(parseFloat(e.target.value))} value={textSize}>
                    <option value="0.9">{translator.translate("Liten")}</option>
                    <option value={DefaultTextSize}>{translator.translate("Medium")}</option>
                    <option value="1.1">{translator.translate("Stor")}</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3" controlId="settingsLevel">
                <Form.Label>{translator.translate("Nivå")}</Form.Label>
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
