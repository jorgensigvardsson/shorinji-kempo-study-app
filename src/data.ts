export type GradeName = "1 kyū" | "2 kyū" | "3 kyū" | "4 kyū" | "5 kyū" | "6 kyū" |
                        "shodan" | "nidan" | "sandan" | "yondan" | "godan" | "rokudan" | "nanadan" | "hachidan" | "kudan";
"nidan"
export const humanGradeName = (ln: GradeName): string => {
    return ln;
}

export interface GradePlan {
  grade: GradeName;
  note?: string;
  weeks: Week[];
}

export type Week = RegularWeek | KihonOnlyWeek | ReviewPreparationWeek;

export interface RegularWeek {
  week: number;
  type: "regular_week";
  kihon_shoho?: string[];
  moments: Moment[];
}

export interface KihonOnlyWeek {
  week: number;
  type: "kihon_only";
  kihon_shoho: string[];
  moments: Moment[];
}

export interface ReviewPreparationWeek {
  week: number;
  type: "review_preparation_week";
  content: string[];
}

export type Moment = HokeiMoment | StandardMoment;

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

export function getHokeiMoments(week: Week): HokeiMoment[] {
  if (isReviewPreparationWeek(week)) return [];
  return week.moments.filter(isHokeiMoment);
}

export function getStandardMoments(week: Week): StandardMoment[] {
  if (isReviewPreparationWeek(week)) return [];
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
