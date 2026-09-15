import { readFile } from 'node:fs/promises';

const rawText = await readFile('src/data/skills.raw.json', 'utf8');
const rawData = JSON.parse(rawText);

const records = Object.values(rawData.skilldata)
  .filter((skill) => skill.id > 0)
  .filter((skill) => !skill.is_pvp)
  .filter((skill) => {
    const english = skill.lang?.en ?? skill.lang?.['en-gww'];
    return english?.name && english?.description;
  });

const byType = new Map();

for (const skill of records) {
  const type = skill.type;

  if (!byType.has(type)) {
    byType.set(type, []);
  }

  byType.get(type).push(skill);
}

for (const [type, skills] of [...byType.entries()].sort(
  ([a], [b]) => Number(a) - Number(b),
)) {
  console.log(`\n========== TYPE ${type} (${skills.length} skills) ==========`);

  for (const skill of skills.slice(0, 8)) {
    const english = skill.lang?.en ?? skill.lang?.['en-gww'];

    console.log(`ID ${skill.id}: ${english.name}`);
    console.log(`  ${english.description}`);
  }
}