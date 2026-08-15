import type { HokeiRef, StandardMoment, Week } from "./data";
import { isHokeiMoment } from "./data";
import type { Translator } from "./i18n";

export const localizeSourceTerm = (value: string, translator: Translator, japanese: boolean, capitalize = false): string =>
    japanese ? translator.japanese(value) : translator.translate(value, { capitalize });

export const hokeiReferenceLabel = (entry: HokeiRef, translator: Translator, japanese: boolean): string => {
    const name = localizeSourceTerm(entry.hokei_ref, translator, japanese, !japanese);
    if (entry.variants.length === 0) return name;
    const variants = formatReadableList(entry.variants.map(value => localizeSourceTerm(value, translator, japanese)), translator);
    return `${name} (${variants})`;
};

export const standardMomentLabel = (moment: StandardMoment, translator: Translator, japanese: boolean): string => {
    const parts = moment.content.map(content => {
        if (content !== "randori") return localizeSourceTerm(content, translator, japanese, true);

        const randoriParts = [localizeSourceTerm("Randori", translator, japanese)];
        if (moment.randori) randoriParts.push(localizeSourceTerm(moment.randori, translator, japanese));
        let label = randoriParts.join(" · ");
        if (moment.restrictions) label += ` — ${localizeSourceTerm(moment.restrictions, translator, japanese)}`;
        return label;
    });
    return parts.join(" · ");
};

export const weekIntroduction = (week: Week, translator: Translator): string => {
    if (week.type === "review_preparation_week") {
        return translator.translate("En vecka för att samla ihop det du arbetat med: {0}.", {
            params: [formatReadableList(week.content.map(value => localizeSourceTerm(value, translator, false)), translator)],
        });
    }

    if (week.type === "yondan_week") {
        const studyNames = formatReadableList(
            week.study_teach.map(entry => hokeiReferenceLabel(entry, translator, false)),
            translator,
        );
        return week.moment
            ? translator.translate("Veckan förenar studier och undervisning av {0} med {1}.", {
                params: [studyNames, localizeSourceTerm(week.moment.hokei_name, translator, false, true)],
            })
            : translator.translate("Veckan ägnas åt att studera och undervisa {0}.", { params: [studyNames] });
    }

    if (week.type === "godan_week") {
        return translator.translate("Den här veckan får {0} stå i centrum.", {
            params: [localizeSourceTerm(week.moment.hokei_name, translator, false, true)],
        });
    }

    if (week.type === "kyusho_zeme_week") {
        return translator.translate("Den här veckan får arbetet med {0} stå i centrum.", {
            params: [localizeSourceTerm(week.zeme.name, translator, false, true)],
        });
    }

    const sentences: string[] = [];
    const basicEntries = (week.kihon_shoho ?? []).filter((entry): entry is string => typeof entry === "string");
    const basicFocus = describeBasicFocus(basicEntries, translator);
    if (basicFocus) {
        sentences.push(translator.translate("Veckans grundarbete rör sig kring {0}.", { params: [basicFocus] }));
    }

    const hokeiNames = week.moments
        .filter(isHokeiMoment)
        .map(moment => localizeSourceTerm(moment.hokei_name, translator, false, true));
    if (hokeiNames.length > 0) {
        sentences.push(translator.translate("{0} står i centrum.", {
            params: [formatReadableList(hokeiNames, translator)],
        }));
    }

    const recurring = recurringMomentDescriptions(
        week.moments.filter((moment): moment is StandardMoment => moment.type === "standard_moment"),
        translator,
    );
    if (recurring.length > 0) {
        sentences.push(translator.translate("{0} återkommer genom veckan.", {
            params: [formatReadableList(recurring, translator)],
        }));
    }

    return sentences.join(" ") || translator.translate("Veckans innehåll följer planen för din grad.");
};

const BASIC_FOCUS_RULES: Array<{ label: string; pattern: RegExp }> = [
    { label: "reishiki och shosahō", pattern: /nyūmonshiki|reishiki|shosahō|gasshō rei|samu|fukusō|taido|kotoba/i },
    { label: "förflyttning och tai sabaki", pattern: /ashi|irimi|sagari|yorimi|umpohō|tai sabaki|tenshin|tenkan|fujinhō|chōsokuhō/i },
    { label: "ukemi", pattern: /ukemi|okiagari|dai sharin/i },
    { label: "kōbōgi", pattern: /kōbō|kōgi|bōgi|ren uke/i },
    { label: "kyūsho", pattern: /kyūsho/i },
    { label: "tan’en och sōtai", pattern: /tan'en|sōtai/i },
    { label: "principer och studier", pattern: /principer|studera|träna/i },
    // `uke` is bounded because it is a whole word here — the block in "uchi uke" —
    // and unbounded it also matches inside "ukemi", which is a fall, not a block. That
    // put "slag, sparkar och uke" on three weeks whose basic work is only ukemi.
    { label: "slag, sparkar och uke", pattern: /zuki|geri|uchi|giri|\buke\b|ate/i },
];

const describeBasicFocus = (entries: string[], translator: Translator): string => {
    const labels = BASIC_FOCUS_RULES
        .filter(rule => entries.some(entry => rule.pattern.test(entry)))
        .map(rule => translator.translate(rule.label));
    if (labels.length === 0 && entries.length > 0) labels.push(translator.translate("kihon shohō"));
    return formatReadableList(labels.slice(0, 4), translator);
};

const recurringMomentDescriptions = (moments: StandardMoment[], translator: Translator): string[] => {
    const descriptions = moments.flatMap(moment => moment.content.map(content => {
        if (content !== "randori") return localizeSourceTerm(content, translator, false, true);
        const restriction = moment.restrictions && localizeSourceTerm(moment.restrictions, translator, false);
        const kind = moment.randori && localizeSourceTerm(moment.randori, translator, false);
        if (kind && restriction) {
            return translator.translate("Randori i {0} med fokus på {1}", { params: [kind, restriction] });
        }
        if (restriction) return translator.translate("Randori med fokus på {0}", { params: [restriction] });
        if (kind) return translator.translate("Randori i {0}", { params: [kind] });
        return translator.translate("Randori");
    }));
    return [...new Set(descriptions)];
};

const formatReadableList = (values: string[], translator: Translator): string => {
    const locale = translator.currentLanguage === "sv" ? "sv-SE"
        : translator.currentLanguage === "en" ? "en-GB"
            : translator.currentLanguage === "tr" ? "tr-TR"
                : "ja-JP";
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(values);
};
