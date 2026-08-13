import { useMemo } from "react";
import { Form } from "react-bootstrap";
import { noTranslate } from "../i18n";
import { allGoogleFonts, filterGoogleFonts, type FontCategory, type FontFilter } from "../google-fonts";

interface Props {
    value: string;
    onChange: (family: string) => void;
    // Filter state is a controlled prop, not local state: TrainingControls
    // unmounts this component's panel on every route change (it auto-collapses
    // the toolbar), which would otherwise reset the filters on every navigation.
    // The owner (App.tsx) holds it for the lifetime of the session instead.
    filter: FontFilter;
    onFilterChange: (filter: FontFilter) => void;
}

const categoryLabels: Record<FontCategory, string> = {
    "sans-serif": "Sans Serif",
    "serif": "Serif",
    "display": "Display",
    "handwriting": "Handwriting",
    "monospace": "Monospace",
};

const categories = [...new Set(allGoogleFonts.map(font => font.category))].sort();
const subsets = [...new Set(allGoogleFonts.flatMap(font => font.subsets))].sort();

// Experimental font picker (see src/google-fonts.ts's isFontPickerEnabled):
// filters the bundled Google Fonts snapshot the same way fonts.google.com's
// own filters work (name search, category, language), and feeds a plain
// <select> with the matches. Developer-only tooling, so labels are
// deliberately unlocalized (noTranslate) rather than added to translations.json.
const FontPicker = ({ value, onChange, filter, onFilterChange }: Props) => {
    const filtered = useMemo(
        () => filterGoogleFonts(allGoogleFonts, filter),
        [filter],
    );

    return (
        <div className="font-picker">
            <Form.Control
                size="sm"
                type="text"
                placeholder={noTranslate("Search fonts…")}
                aria-label={noTranslate("Search fonts")}
                value={filter.search}
                onChange={event => onFilterChange({ ...filter, search: event.target.value })}
            />
            <div className="font-picker-filters">
                <Form.Select size="sm" aria-label={noTranslate("Category")} value={filter.category} onChange={event => onFilterChange({ ...filter, category: event.target.value })}>
                    <option value="">{noTranslate("All categories")}</option>
                    {categories.map(c => (
                        <option key={c} value={c}>{categoryLabels[c]}</option>
                    ))}
                </Form.Select>
                <Form.Select size="sm" aria-label={noTranslate("Language")} value={filter.subset} onChange={event => onFilterChange({ ...filter, subset: event.target.value })}>
                    <option value="">{noTranslate("All languages")}</option>
                    {subsets.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </Form.Select>
            </div>
            <Form.Select
                size="sm"
                aria-label={noTranslate("Font")}
                value={value}
                onChange={event => onChange(event.target.value)}
            >
                <option value="">{noTranslate("Default")}</option>
                {filtered.map(font => (
                    <option key={font.family} value={font.family}>{font.family}</option>
                ))}
            </Form.Select>
        </div>
    );
};

export default FontPicker;
