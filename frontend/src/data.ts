export type GradeName = "1 kyū" | "2 kyū" | "3 kyū" | "4 kyū" | "5 kyū" | "6 kyū" |
                        "shodan" | "nidan" | "sandan" | "yondan" | "godan" | "rokudan" | "nanadan" | "hachidan" | "kudan";

export const humanGradeName = (ln: GradeName): string => {
    return ln;
}

const gradeProgression: GradeName[] = [
    "6 kyū", "5 kyū", "4 kyū", "3 kyū", "2 kyū", "1 kyū",
    "shodan", "nidan", "sandan", "yondan", "godan", "rokudan", "nanadan", "hachidan", "kudan",
];

export function nextGrade(grade: GradeName): GradeName | undefined {
    const idx = gradeProgression.indexOf(grade);
    return idx >= 0 && idx < gradeProgression.length - 1 ? gradeProgression[idx + 1] : undefined;
}

export interface TanenKihonHokei {
  hokei_name: string;
  videos?: Video[];
  _ja?: string;
}

export interface GradePlan {
  grade: GradeName;
  note?: string;
  weeks: Week[];
}

// Looks up the plan for a grade, falling back to the first one when there is none.
//
// The grade in a user's document is not guaranteed to name a plan this build ships: a
// grade can be renamed or dropped from the kamokuhyō, and a device that has been
// offline can sync an old one back long afterwards. Asserting the lookup succeeded —
// which is what the call sites used to do — turned that into a crash at render, taking
// the whole app down rather than one page.
//
// The stored grade is deliberately left alone rather than corrected: rendering
// something usable is this function's job, and silently rewriting a user's profile is
// not. An empty plans array is a broken build, and there is nothing to fall back to.
export function findGradePlan(plans: GradePlan[], grade: GradeName): GradePlan {
  return plans.find(plan => plan.grade === grade) ?? plans[0];
}

export type Week = RegularWeek | KihonOnlyWeek | ReviewPreparationWeek | YondanWeek | GodanWeek | KyushoZemeWeek;

/**
 * A reference to a previously-taught hōkei by name, with optional variant
 * qualifiers such as ["katate", "morote"].
 */
export type HokeiRef = { hokei_ref: string; variants: string[] };

/**
 * An entry in the kihon-shohō column. Either free text, or a hōkei reference.
 */
export type KihonShohoEntry = string | HokeiRef;

export interface RegularWeek {
  week: number;
  type: "regular_week";
  kihon_shoho?: KihonShohoEntry[];
  moments: Moment[];
}

export interface KihonOnlyWeek {
  week: number;
  type: "kihon_only";
  kihon_shoho: KihonShohoEntry[];
  moments: Moment[];
}

export function isHokeiRef(entry: KihonShohoEntry): entry is HokeiRef {
  return typeof entry === "object" && "hokei_ref" in entry;
}

export interface YondanWeek {
  week: number;
  type: "yondan_week";
  study_teach: HokeiRef[];
  moment?: YondanHokeiMoment;
}

export interface YondanHokeiMoment {
  type: "yondan_hokei_moment";
  hokei_name: string;
  variations: string[];
  technique_group: string;
  roles?: { attacker?: RoleDetails; defender?: RoleDetails };
  kyohan_pages: number[];
}

export interface GodanWeek {
  week: number;
  type: "godan_week";
  moment: GodanHokeiMoment;
}

export interface GodanHokeiMoment {
  type: "godan_hokei_moment";
  hokei_name: string;
  variations: string[];
  technique_group?: string;
  kyohan_pages: number[];
}

/**
 * A kyūsho-attack ("zeme") drill — not a defensive hōkei but a drill in
 * exploiting a specific vital point. Used from godan onwards.
 */
export interface KyushoZemeWeek {
  week: number;
  type: "kyusho_zeme_week";
  zeme: KyushoZeme;
}

export interface KyushoZeme {
  type: "kyusho_zeme";
  name: string;
  kyohan_pages: number[];
}

export interface ReviewPreparationWeek {
  week: number;
  type: "review_preparation_week";
  content: string[];
}

export type Moment = HokeiMoment | StandardMoment;

/**
 * A link to a demonstration video. `label` distinguishes multiple videos for
 * the same item (e.g. a variation); omit it when there is a single video.
 */
export interface Video {
  url: string;
  label?: string;
}

export interface HokeiMoment {
  type: "hokei_moment";
  hokei_name: string;
  ren_hanko: boolean;
  variations: string[];
  technique_group: string;
  foot_stance: string[];
  roles: Roles;
  references?: string[];
  kyohan_pages: number[];
  videos?: Video[];
}

export interface Roles {
  attacker: RoleDetails;
  defender: RoleDetails;
}

export interface RoleDetails {
  stance?: string;
  action?: string;
}

export interface StandardMoment {
  type: "standard_moment";
  randori?: string;
  content: string[];
  restrictions?: string;
}

/**
 * Narrowers / type guards
 */

export function isReviewPreparationWeek(week: Week): week is ReviewPreparationWeek {
  return week.type === "review_preparation_week";
}

export function isYondanWeek(week: Week): week is YondanWeek {
  return week.type === "yondan_week";
}

export function isGodanWeek(week: Week): week is GodanWeek {
  return week.type === "godan_week";
}

export function isKyushoZemeWeek(week: Week): week is KyushoZemeWeek {
  return week.type === "kyusho_zeme_week";
}

export function isKihonOnlyWeek(week: Week): week is KihonOnlyWeek {
  return week.type === "kihon_only";
}

export function isRegularWeek(week: Week): week is RegularWeek {
  return week.type === "regular_week";
}

export function isStandardMoment(moment: Moment): moment is StandardMoment {
  return "type" in moment && moment.type === "standard_moment";
}

export function isHokeiMoment(moment: Moment): moment is HokeiMoment {
  return "hokei_name" in moment;
}

/**
 * Small helpers that are handy when consuming imported JSON assets.
 */

export function adaptYondanMoment(m: YondanHokeiMoment): HokeiMoment {
  return {
    type: "hokei_moment",
    hokei_name: m.hokei_name,
    ren_hanko: false,
    variations: m.variations,
    technique_group: m.technique_group,
    foot_stance: [],
    roles: {
      attacker: m.roles?.attacker ?? {},
      defender: m.roles?.defender ?? {},
    },
    kyohan_pages: m.kyohan_pages,
  };
}

export function adaptGodanMoment(m: GodanHokeiMoment): HokeiMoment {
  return {
    type: "hokei_moment",
    hokei_name: m.hokei_name,
    ren_hanko: false,
    variations: m.variations,
    technique_group: m.technique_group ?? "",
    foot_stance: [],
    roles: { attacker: {}, defender: {} },
    kyohan_pages: m.kyohan_pages,
  };
}

export function adaptKyushoZeme(z: KyushoZeme): HokeiMoment {
  return {
    type: "hokei_moment",
    hokei_name: z.name,
    ren_hanko: false,
    variations: [],
    technique_group: "",
    foot_stance: [],
    roles: { attacker: {}, defender: {} },
    kyohan_pages: z.kyohan_pages,
  };
}

export function getHokeiMoments(week: Week): HokeiMoment[] {
  if (isYondanWeek(week)) return week.moment ? [adaptYondanMoment(week.moment)] : [];
  if (isGodanWeek(week)) return [adaptGodanMoment(week.moment)];
  if (isKyushoZemeWeek(week)) return [adaptKyushoZeme(week.zeme)];
  if (!("moments" in week)) return [];
  return week.moments.filter(isHokeiMoment);
}

export function getStandardMoments(week: Week): StandardMoment[] {
  if (!("moments" in week)) return [];
  return week.moments.filter(isStandardMoment);
}

export function getAllHokeiMoments(plan: GradePlan): HokeiMoment[] {
  return plan.weeks.flatMap(getHokeiMoments);
}

export function getWeeksWithKihonShoho(plan: GradePlan): Array<RegularWeek | KihonOnlyWeek> {
  return plan.weeks.filter(
    (week): week is RegularWeek | KihonOnlyWeek =>
      (week.type === "regular_week" || week.type === "kihon_only") &&
      Array.isArray(week.kihon_shoho)
  );
}


export interface WordListEntry {
    index: number;
    kanji?: string;
    romaji?: string;
    meanings?: string[];
}
