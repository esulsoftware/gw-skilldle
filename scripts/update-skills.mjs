import { mkdir, writeFile } from "node:fs/promises";

const SOURCE_URL =
  "https://build-wars.github.io/gw-skilldata/json/skilldata-combined.json";

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(
    `Could not download skill data: ${response.status} ${response.statusText}`,
  );
}

const source = await response.json();

console.log("Top-level keys:", Object.keys(source));
console.log("Skill count:", Object.keys(source.skilldata ?? {}).length);

await mkdir("src/data", { recursive: true });

await writeFile(
  "src/data/skills.raw.json",
  JSON.stringify(source, null, 2) + "\n",
);

console.log("Downloaded data to src/data/skills.raw.json");