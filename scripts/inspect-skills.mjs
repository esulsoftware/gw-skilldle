import { readFile } from "node:fs/promises";

const raw = await readFile("src/data/skills.raw.json", "utf8");
const data = JSON.parse(raw);

const records = Object.values(data.skilldata);

console.log(`Total records: ${records.length}`);
console.log("First record:");
console.dir(records[0], { depth: null });

console.log("\nRecords whose serialized data contains 'Healing Signet':");
for (const skill of records.filter((skill) =>
  JSON.stringify(skill).toLowerCase().includes("healing signet"),
)) {
  console.dir(skill, { depth: null });
}