import { writeFileSync } from "fs";
import { resolve } from "path";

// One-off/occasional maintenance script — not part of the build. Regenerates
// the static font-metadata snapshot the experimental (VITE_DEBUG-only) font
// picker filters over. The API key is never written to disk or committed;
// pass it as an env var: GOOGLE_FONTS_API_KEY=xxx npm run fonts:fetch
// Get a free key at https://console.cloud.google.com (enable "Fonts Developer API").

const apiKey = process.env.GOOGLE_FONTS_API_KEY;
if (!apiKey) {
  console.error("Usage: GOOGLE_FONTS_API_KEY=<key> npm run fonts:fetch");
  console.error("Get a free key at https://console.cloud.google.com (enable the Fonts Developer API).");
  process.exit(1);
}

interface WebfontItem {
  family: string;
  category: string;
  subsets: string[];
}

interface WebfontsResponse {
  items: WebfontItem[];
}

const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}&sort=alpha`;

const response = await fetch(url);
if (!response.ok) {
  console.error(`Google Fonts API request failed: ${response.status} ${response.statusText}`);
  console.error(await response.text());
  process.exit(1);
}

const data = await response.json() as WebfontsResponse;
const fonts = data.items.map(({ family, category, subsets }) => ({ family, category, subsets }));

const root = process.cwd();
const outPath = resolve(root, "src/assets/google-fonts.json");
writeFileSync(outPath, JSON.stringify(fonts, null, 2) + "\n", "utf-8");

console.log(`Wrote ${fonts.length} font families to ${outPath}`);
