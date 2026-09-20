import { getHokeiMoments, type GradePlan } from "./data";

export const searchableText = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

export function searchScore(query: string, title: string, other: string[] = []): number {
    const needle = searchableText(query);
    if (!needle) return 1;
    const name = searchableText(title);
    const text = searchableText([title, ...other].join(" "));
    if (!needle.split(/\s+/).every(part => text.includes(part))) return 0;
    return name === needle ? 4 : name.startsWith(needle) ? 3 : name.includes(needle) ? 2 : 1;
}

export function techniqueCatalogue(plans: GradePlan[]) {
    const seen = new Set<string>();
    return plans.flatMap(plan => plan.weeks.flatMap(week => getHokeiMoments(week)
        .filter(hokei => {
            if (seen.has(hokei.id)) return false;
            seen.add(hokei.id);
            return true;
        })
        .map(hokei => ({ hokei, grade: plan.grade }))));
}
