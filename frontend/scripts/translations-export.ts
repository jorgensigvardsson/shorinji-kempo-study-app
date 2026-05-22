import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const lang = process.argv[2];
if (!lang) {
  console.error("Usage: npm run translations:export -- <lang>");
  console.error("Example: npm run translations:export -- ja");
  process.exit(1);
}

const root = process.cwd();
const translationsPath = resolve(root, "src/assets/translations.json");
const exportDir = resolve(root, "translation-exports");
const exportPath = resolve(exportDir, `${lang}.json`);
const baselinePath = resolve(exportDir, `${lang}.baseline.json`);

const translations: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(translationsPath, "utf-8")
);

if (!translations[lang]) {
  console.error(`Language "${lang}" not found in translations.json.`);
  console.error(`Available languages: ${Object.keys(translations).join(", ")}`);
  process.exit(1);
}

const section = translations[lang];
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
