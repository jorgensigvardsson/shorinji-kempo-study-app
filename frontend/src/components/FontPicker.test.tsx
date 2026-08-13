import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FontPicker from "./FontPicker";
import { allGoogleFonts, type FontFilter } from "../google-fonts";

const emptyFilter: FontFilter = { search: "", category: "", subset: "" };

// FontPicker is a fully controlled component (see FontPicker.tsx for why:
// TrainingControls unmounts it on every route change, so the filter state
// can't live inside FontPicker itself). This harness plays the role App.tsx
// plays for real — holding the filter state and re-rendering on change —
// so the tests exercise it the same way a real parent would.
const Harness = ({ label = "Body", value = "", onChange = () => undefined }: { label?: string; value?: string; onChange?: (family: string) => void }) => {
    const [filter, setFilter] = useState(emptyFilter);
    return <FontPicker label={label} value={value} onChange={onChange} filter={filter} onFilterChange={setFilter} />;
};

describe("FontPicker", () => {
    it("lists every bundled font by default", () => {
        render(<Harness />);

        const select = screen.getByRole("combobox", { name: "Body font" }) as HTMLSelectElement;
        expect(select.options.length).toBe(allGoogleFonts.length + 1); // + "Default"
    });

    it("narrows the font dropdown as the user types a search term", () => {
        render(<Harness />);

        fireEvent.change(screen.getByPlaceholderText("Search Body fonts…"), { target: { value: "roboto" } });

        const select = screen.getByRole("combobox", { name: "Body font" }) as HTMLSelectElement;
        const optionLabels = [...select.options].map(o => o.textContent);
        expect(optionLabels).toContain("Roboto");
        expect(optionLabels).not.toContain("Playfair Display");
    });

    it("narrows the font dropdown by category", () => {
        render(<Harness />);

        fireEvent.change(screen.getByRole("combobox", { name: "Body category" }), { target: { value: "monospace" } });

        const select = screen.getByRole("combobox", { name: "Body font" }) as HTMLSelectElement;
        const optionLabels = [...select.options].map(o => o.textContent);
        expect(optionLabels).toContain("Roboto Mono");
        expect(optionLabels).not.toContain("Roboto");
    });

    it("narrows the font dropdown by language", () => {
        render(<Harness />);

        fireEvent.change(screen.getByRole("combobox", { name: "Body language" }), { target: { value: "japanese" } });

        const select = screen.getByRole("combobox", { name: "Body font" }) as HTMLSelectElement;
        const optionLabels = [...select.options].map(o => o.textContent);
        expect(optionLabels).toContain("Noto Sans JP");
        expect(optionLabels).not.toContain("Roboto");
    });

    it("calls onChange with the selected family", () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        fireEvent.change(screen.getByRole("combobox", { name: "Body font" }), { target: { value: "Roboto" } });

        expect(onChange).toHaveBeenCalledWith("Roboto");
    });

    it("keeps the filters it's given, rather than owning its own state", () => {
        const onFilterChange = vi.fn();
        render(<FontPicker label="Body" value="" onChange={() => undefined} filter={{ search: "robo", category: "", subset: "" }} onFilterChange={onFilterChange} />);

        expect((screen.getByPlaceholderText("Search Body fonts…") as HTMLInputElement).value).toBe("robo");
        const select = screen.getByRole("combobox", { name: "Body font" }) as HTMLSelectElement;
        expect([...select.options].map(o => o.textContent)).toEqual(["Default", "Roboto", "Roboto Condensed", "Roboto Mono", "Roboto Serif"]);
    });

    // Body and heading fonts are independent choices, so both pickers are shown
    // at once in the toolbar. Their controls must have distinct accessible names
    // or a screen reader (and getByRole queries) can't tell them apart.
    it("uses the label prop to keep multiple pickers on the same page distinguishable", () => {
        render(
            <>
                <FontPicker label="Body" value="" onChange={() => undefined} filter={emptyFilter} onFilterChange={() => undefined} />
                <FontPicker label="Heading" value="" onChange={() => undefined} filter={emptyFilter} onFilterChange={() => undefined} />
            </>,
        );

        expect(screen.getByRole("combobox", { name: "Body font" })).toBeTruthy();
        expect(screen.getByRole("combobox", { name: "Heading font" })).toBeTruthy();
    });
});
