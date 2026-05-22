import type { TanenKihonHokei, Video } from "../data";

const ORDINALS = ["ikkei", "nikei", "sankei", "yonkei", "gokei", "rokkei", "nanakei", "hakkei"];

/**
 * Resolves a kihon_shoho / techniqueGroup romaji string against the tanen map.
 *
 * Handles:
 *  - Exact match: "tenchi ken dai ikkei (tan'en)"
 *  - Combined qualifiers: "ryūō ken dai ikkei (tan'en, sōtai)" → two entries
 *  - Ignored qualifiers: "(hidari & migi)" stripped, contextQualifier used
 *  - Range expansion: "tenchi ken dai ikkei - dai rokkei" → six entries
 */
export function findTanenMatches(
    entry: string,
    tanenMap: Map<string, TanenKihonHokei>,
    contextQualifier?: string
): TanenKihonHokei[] {
    const trimmed = entry.trim();

    // 1. Exact match
    const exact = tanenMap.get(trimmed);
    if (exact) return [exact];

    // 2. Strip trailing parenthetical qualifier, collect tan'en / sōtai mentions
    const qualMatch = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const base = qualMatch ? qualMatch[1].trim() : trimmed;
    const qualStr = qualMatch ? qualMatch[2] : "";

    const explicitQuals: string[] = [];
    if (qualStr.includes("tan'en")) explicitQuals.push("tan'en");
    if (qualStr.includes("sōtai")) explicitQuals.push("sōtai");

    const effectiveQuals =
        explicitQuals.length > 0 ? explicitQuals
        : contextQualifier ? [contextQualifier]
        : [];

    // 3. Range expansion: "X dai ikkei - dai rokkei" or "X dai ikkei - rokkei"
    const rangeMatch = base.match(/^(.+?)\s+dai\s+(\w+)\s*[-〜～]\s*(?:dai\s+)?(\w+)$/);
    if (rangeMatch) {
        const prefix = rangeMatch[1].trim();
        const startIdx = ORDINALS.indexOf(rangeMatch[2]);
        const endIdx = ORDINALS.indexOf(rangeMatch[3]);
        if (startIdx >= 0 && endIdx >= 0 && endIdx >= startIdx) {
            const qualsToTry = effectiveQuals.length > 0 ? effectiveQuals : ["tan'en", "sōtai"];
            const results: TanenKihonHokei[] = [];
            for (let i = startIdx; i <= endIdx; i++) {
                for (const q of qualsToTry) {
                    const candidate = `${prefix} dai ${ORDINALS[i]} (${q})`;
                    const match = tanenMap.get(candidate);
                    if (match && !results.includes(match)) results.push(match);
                }
            }
            return results;
        }
    }

    // 4. Non-range: apply effective qualifiers to base
    if (effectiveQuals.length > 0) {
        return effectiveQuals
            .map(q => tanenMap.get(`${base} (${q})`))
            .filter((t): t is TanenKihonHokei => t !== undefined);
    }

    return [];
}

/** Converts tanen matches to labeled Video objects ready for VideoLink. */
export function tanenMatchesToVideos(matches: TanenKihonHokei[]): Video[] {
    return matches.flatMap(t =>
        (t.videos ?? []).map(v => ({ url: v.url, label: t.hokei_name }))
    );
}
