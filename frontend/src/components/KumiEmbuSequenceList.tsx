import { useContext, useEffect, useRef, useState } from "react";
import type { GradeName, HokeiMoment } from "../data";
import type { Item } from "../grading-exam-information";
import { TranslatorContext } from "../i18n";
import { normalizeString } from "../strings";
import HokeiCard from "./HokeiCard";
import "./KumiEmbuSequenceList.css";

export interface KumiEmbuTechniqueLink {
    key: string;
    hokei: HokeiMoment;
    grade: GradeName;
}

interface Props {
    items: Item[];
    techniques: KumiEmbuTechniqueLink[];
    dojoMode: boolean;
}

interface KumiEmbuTermPart {
    value: string;
    separator: boolean;
    techniques: KumiEmbuTechniqueLink[];
}

const normalizedTechniqueName = (value: string) => normalizeString(value).replace(/\s+/g, " ").trim();

const resolveKumiEmbuTermParts = (
    value: string,
    techniques: KumiEmbuTechniqueLink[],
): KumiEmbuTermPart[] => {
    const techniquesByName = new Map<string, KumiEmbuTechniqueLink[]>();
    for (const technique of techniques) {
        const name = normalizedTechniqueName(technique.hokei.hokei_name);
        techniquesByName.set(name, [...(techniquesByName.get(name) ?? []), technique]);
    }

    const resolvePart = (rawPart: string): KumiEmbuTechniqueLink[] => {
        const qualifiers = [...rawPart.matchAll(/\(([^)]+)\)/g)]
            .flatMap(match => match[1].split(/[,/]\s*/))
            .map(normalizedTechniqueName);
        const part = rawPart.replace(/\s*\([^)]*\)/g, "").trim();
        const withoutRenHanko = part.replace(/\s+ren hankō$/i, "").trim();
        const candidates = [part, withoutRenHanko, withoutRenHanko.replace(/\btsuki$/i, "zuki")]
            .map(normalizedTechniqueName)
            .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

        let matchedName = candidates.find(candidate => techniquesByName.has(candidate));
        if (!matchedName) {
            matchedName = [...techniquesByName.keys()]
                .filter(name => candidates.some(candidate => candidate.startsWith(`${name} `)))
                .sort((left, right) => right.length - left.length)[0];
        }
        if (!matchedName) {
            matchedName = [...techniquesByName.keys()]
                .filter(name => candidates.some(candidate => {
                    if (!candidate.endsWith(` ${name}`)) return false;
                    const prefix = candidate.slice(0, -(name.length + 1));
                    return (techniquesByName.get(name) ?? []).some(technique =>
                        technique.hokei.variations.some(variation => normalizedTechniqueName(variation) === prefix));
                }))
                .sort((left, right) => right.length - left.length)[0];
        }
        if (!matchedName) return [];

        const matchingTechniques = techniquesByName.get(matchedName) ?? [];
        const qualifiedTechniques = qualifiers.length === 0 ? matchingTechniques : matchingTechniques.filter(technique =>
            qualifiers.every(qualifier => technique.hokei.variations.some(variation =>
                normalizedTechniqueName(variation) === qualifier)));
        const resolved = qualifiedTechniques.length > 0 ? qualifiedTechniques : matchingTechniques;

        return [...resolved.reduce((unique, technique) => {
            const signature = `${normalizedTechniqueName(technique.hokei.hokei_name)}|${technique.hokei.variations.map(normalizedTechniqueName).sort().join("|")}`;
            if (!unique.has(signature)) unique.set(signature, technique);
            return unique;
        }, new Map<string, KumiEmbuTechniqueLink>()).values()];
    };

    let precedingTechniques: KumiEmbuTechniqueLink[] = [];
    let precedingSeparator = "";
    return value.split(/(\s+(?:&|-)\s+)/).filter(Boolean).map((part, index) => {
        if (index % 2 === 1) {
            precedingSeparator = part.trim();
            return { value: part, separator: true, techniques: [] };
        }

        const resolved = resolvePart(part);
        // A named finish such as mae yubi gatame or kannuki gatame is often not a
        // standalone hōkei. After a dash it belongs to the preceding hōkei, so
        // opening that card is more useful than silently making the finish inert.
        // An ampersand joins separate techniques and deliberately gets no fallback.
        const techniques = resolved.length > 0
            ? resolved
            : precedingSeparator === "-" ? precedingTechniques : [];
        if (resolved.length > 0) precedingTechniques = resolved;
        return { value: part, separator: false, techniques };
    });
};

const KumiEmbuTerm = ({ value, techniques, dojoMode, onTechniqueSelect }: {
    value: string;
    techniques: KumiEmbuTechniqueLink[];
    dojoMode: boolean;
    onTechniqueSelect: (technique: KumiEmbuTechniqueLink) => void;
}) => {
    const translator = useContext(TranslatorContext);
    const parts = resolveKumiEmbuTermParts(value, techniques);
    const hasLinkedTechnique = parts.some(part => part.techniques.length > 0);
    const primary = translator.isJapanese ? translator.japanese(value) : translator.translate(value);
    const japanese = !translator.isJapanese && !dojoMode ? translator.japanese(value) : null;
    const showJapanese = japanese && japanese !== value && japanese !== primary;

    return (
        <span className="kumi-embu-term">
            {hasLinkedTechnique ? (
                <span className="kumi-embu-inline-term">
                    {parts.map((part, index) => {
                        if (part.separator) {
                            const separator = part.value.trim() === "&" ? "\u00a0&\u00a0" : part.value;
                            return <span key={`${index}.${part.value}`}>{separator}</span>;
                        }
                        const label = translator.isJapanese ? translator.japanese(part.value) : translator.translate(part.value);
                        return part.techniques.length > 0 ? (
                            <button
                                key={`${index}.${part.value}`}
                                type="button"
                                className="kumi-embu-step-button"
                                aria-label={translator.translate("Visa teknik {0}", { params: [part.value.trim()] })}
                                onClick={() => onTechniqueSelect(part.techniques[0])}
                            >
                                {label}
                            </button>
                        ) : (
                            <span key={`${index}.${part.value}`}>{label}</span>
                        );
                    })}
                </span>
            ) : (
                <span>{primary}</span>
            )}
            {showJapanese && <span className="kumi-embu-term-japanese">{japanese}</span>}
        </span>
    );
};

const KumiEmbuSequenceList = ({ items, techniques, dojoMode }: Props) => {
    const translator = useContext(TranslatorContext);
    const [preview, setPreview] = useState<{
        stepIndex: number;
        technique: KumiEmbuTechniqueLink;
        requestId: number;
    } | null>(null);
    const previewRequestId = useRef(0);
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!preview) return;
        const scrollFrame = window.requestAnimationFrame(() => {
            const previewElement = previewRef.current;
            if (!previewElement) return;
            const navbarBottom = document.querySelector<HTMLElement>(".navbar")?.getBoundingClientRect().bottom ?? 0;
            const previewTop = previewElement.getBoundingClientRect().top;
            if (previewTop < navbarBottom || previewTop >= window.innerHeight) {
                previewElement.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
            }
        });
        return () => window.cancelAnimationFrame(scrollFrame);
    }, [preview]);

    const showTechnique = (stepIndex: number, technique: KumiEmbuTechniqueLink) => {
        previewRequestId.current += 1;
        setPreview({ stepIndex, technique, requestId: previewRequestId.current });
    };

    return (
        <ol className={`kumi-embu-sequence-list${dojoMode ? " is-dojo-mode" : ""}`}>
            {items.map((step, index) => (
                <li key={index}>
                    {step.term?.romaji && (
                        <KumiEmbuTerm
                            value={step.term.romaji}
                            techniques={techniques}
                            dojoMode={dojoMode}
                            onTechniqueSelect={technique => showTechnique(index, technique)}
                        />
                    )}
                    {step.annotations?.map((annotation, annotationIndex) => (
                        <div className="kumi-embu-step-note" key={annotationIndex}>
                            {translator.translate(annotation.text)}
                        </div>
                    ))}
                    {preview?.stepIndex === index && (
                        <div className="kumi-embu-technique-preview" ref={previewRef}>
                            <HokeiCard
                                key={`${preview.technique.key}-${preview.requestId}`}
                                hokei={preview.technique.hokei}
                                gradeName={preview.technique.grade}
                                showNotes
                                showRating
                                dojoMode={dojoMode}
                                kamokuLayout
                                defaultOpen
                                onCollapseExited={() => setPreview(current =>
                                    current?.requestId === preview.requestId ? null : current)}
                            />
                        </div>
                    )}
                </li>
            ))}
        </ol>
    );
};

export default KumiEmbuSequenceList;
