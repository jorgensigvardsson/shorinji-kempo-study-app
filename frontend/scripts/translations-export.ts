import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const availableLanguages = (): string[] =>
  readdirSync(resolve(process.cwd(), "src/assets"))
    .map(name => /^translations\.([a-z]{2})\.json$/.exec(name)?.[1])
    .filter((name): name is string => !!name);

const lang = process.argv[2];
if (!lang) {
  console.error("Usage: npm run translations:export -- <lang>");
  console.error("Example: npm run translations:export -- ja");
  process.exit(1);
}

const root = process.cwd();
// One file per language, because each is fetched separately by the app — see
// src/translations.ts. The command is unchanged; only the file it reads moved.
const translationsPath = resolve(root, `src/assets/translations.${lang}.json`);
const exportDir = resolve(root, "translation-exports");
const exportPath = resolve(exportDir, `${lang}.json`);
const baselinePath = resolve(exportDir, `${lang}.baseline.json`);

if (!existsSync(translationsPath)) {
  console.error(`Language "${lang}" has no file at ${translationsPath}.`);
  console.error(`Available languages: ${availableLanguages().join(", ")}`);
  process.exit(1);
}

const section: Record<string, string> = JSON.parse(readFileSync(translationsPath, "utf-8"));
const content = JSON.stringify(section, null, 2) + "\n";

mkdirSync(exportDir, { recursive: true });
writeFileSync(exportPath, content, "utf-8");
writeFileSync(baselinePath, content, "utf-8");

const count = Object.keys(section).length;
console.log(`Exported ${count} keys for language "${lang}".`);
console.log(`  Working copy : ${exportPath}`);
console.log(`  Baseline     : ${baselinePath}`);
console.log();
console.log(`Send "${exportPath}" to the translator.`);
console.log(`Do NOT modify "${baselinePath}" — it is the merge baseline.`);
