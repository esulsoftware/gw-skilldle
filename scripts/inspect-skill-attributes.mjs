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

const byAttribute = new Map();

for (const skill of records) {
  const attribute = skill.attribute;

  if (!byAttribute.has(attribute)) {
    byAttribute.set(attribute, []);
  }

  byAttribute.get(attribute).push(skill);
}

for (const [attribute, skills] of [...byAttribute.entries()].sort(
  ([a], [b]) => Number(a) - Number(b),
)) {
  console.log(
    `\n========== ATTRIBUTE ${attribute} (${skills.length} skills) ==========`,
  );

  for (const skill of skills.slice(0, 8)) {
    const english = skill.lang?.en ?? skill.lang?.['en-gww'];

    console.log(
      `ID ${skill.id}: ${english.name} | Profession ${skill.profession}`,
    );
    console.log(`  ${english.description}`);
  }
}