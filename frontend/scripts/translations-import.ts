import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const lang = process.argv[2];
if (!lang) {
  console.error("Usage: npm run translations:import -- <lang>");
  console.error("Example: npm run translations:import -- ja");
  process.exit(1);
}

const root = process.cwd();
// One file per language, because each is fetched separately by the app - see
// src/translations.ts. The command is unchanged; only the file it touches moved.
const translationsPath = resolve(root, `src/assets/translations.${lang}.json`);
const exportPath = resolve(root, "translation-exports", `${lang}.json`);
const baselinePath = resolve(root, "translation-exports", `${lang}.baseline.json`);

for (const [label, path] of [[`Working copy`, exportPath], [`Baseline`, baselinePath]] as const) {
  if (!existsSync(path)) {
    console.error(`${label} not found: ${path}`);
    console.error(`Run "npm run translations:export -- ${lang}" first.`);
    process.exit(1);
  }
}

type TranslationMap = Record<string, string>;

const ours: TranslationMap = JSON.parse(readFileSync(translationsPath, "utf-8"));
const base: TranslationMap = JSON.parse(readFileSync(baselinePath, "utf-8"));
const theirs: TranslationMap = JSON.parse(readFileSync(exportPath, "utf-8"));

// Merge order: ours first (preserves current key ordering and any new keys added
// since export), then any keys present in base or theirs but not in ours.
const keyOrder = [
  ...Object.keys(ours),
  ...Object.keys(base).filter((k) => !(k in ours)),
  ...Object.keys(theirs).filter((k) => !(k in ours) && !(k in base)),
];

const merged: TranslationMap = {};
let conflicts = 0;
let theirChanges = 0;

for (const key of keyOrder) {
  const baseVal = base[key];
  const ourVal = ours[key];
  const theirVal = theirs[key];

  // Key was removed from ours after export — respect the deletion.
  if (ourVal === undefined) continue;

  // Key is new in ours (added after export) — keep ours, translator never saw it.
  if (baseVal === undefined) {
    merged[key] = ourVal;
    continue;
  }

  const oursChanged = ourVal !== baseVal;
  // Treat a missing key in theirs (translator deleted it) as no change.
  const theirsChanged = theirVal !== undefined && theirVal !== baseVal;

  if (oursChanged && theirsChanged && ourVal !== theirVal) {
    merged[key] = `<<<CONFLICT OURS: ${ourVal} | THEIRS: ${theirVal}>>>`;
    conflicts++;
  } else if (theirsChanged) {
    merged[key] = theirVal!;
    theirChanges++;
  } else {
    merged[key] = ourVal;
  }
}

writeFileSync(translationsPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");

console.log(`Merged "${lang}" translations into translations.${lang}.json.`);
console.log(`  Their changes applied : ${theirChanges}`);
console.log(`  Conflicts             : ${conflicts}`);

if (conflicts > 0) {
  console.warn();
  console.warn(`⚠  Resolve conflicts by searching for "<<<CONFLICT" in translations.${lang}.json.`);
  process.exit(1);
}
