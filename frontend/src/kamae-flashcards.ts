import kihon from "./assets/kihon.json";
import curriculum from "./assets/kamokuhyo.json";
import { getAllHokeiMoments, type CurrentGrade, type GradePlan, type KihonNode } from "./data";

export type KamaeSelection = "kyu" | "all";
export const isKamaeSelection = (value: unknown): value is KamaeSelection => value === "kyu" || value === "all";
export const defaultKamaeSelection = (grade: CurrentGrade): KamaeSelection =>
    grade === "minarai" || grade.endsWith("kyū") ? "kyu" : "all";

const normalize = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
const kyuStances = new Set((curriculum as GradePlan[])
    .filter(plan => plan.grade.endsWith("kyū"))
    .flatMap(getAllHokeiMoments)
    .flatMap(moment => [moment.roles.attacker.stance, moment.roles.defender.stance])
    .filter((stance): stance is string => !!stance)
    .map(normalize));

// Also named in 5 kyū, week 1's Kihon text, under both canonical and alias names.
// This is a curriculum selection, not an assertion about official introduction grades.
const kyuKihonIds = new Set(["byakuren chūdan gamae"]);
const familyIds = new Set(["byakuren hachi jin", "giwa kyū jin"]);

export const kamaeFlashcards = ((kihon as KihonNode[])
    .find(root => root.id === "tai gamae [kihon]")?.children ?? [])
    .filter(family => familyIds.has(family.id))
    .flatMap(family => (family.children ?? []).map(node => ({
        node,
        family,
        kyu: kyuKihonIds.has(node.id) || [node.name, node.alsoKnownAs?.name]
            .some(name => name !== undefined && kyuStances.has(normalize(name))),
    })));
