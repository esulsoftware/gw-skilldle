import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFile);
const projectDirectory = path.resolve(scriptDirectory, '..');

const inputFile = path.join(
  projectDirectory,
  'src',
  'data',
  'skills.raw.json',
);

const outputFile = path.join(
  projectDirectory,
  'src',
  'data',
  'skills.json',
);

const rawText = await readFile(inputFile, 'utf8');
const rawData = JSON.parse(rawText);
const allRecords = Object.values(rawData.skilldata);

function costOrNull(value) {
  return value === 0 ? null : value ?? null;
}

function englishText(skill) {
  return skill.lang?.['en-gww'] ?? skill.lang?.en ?? null;
}

const skills = allRecords
  .map((skill) => {
    const english = englishText(skill);

    if (!english?.name || !english.description) {
      return null;
    }

    return {
      id: skill.id,
      name: english.name,
      description: english.description,
      conciseDescription: english.concise ?? english.description,

      campaign: skill.campaign ?? 0,
      profession: skill.profession ?? 0,
      attribute: skill.attribute ?? 21,
      type: skill.type ?? 0,

      elite: Boolean(skill.is_elite),

      energy: costOrNull(skill.energy),
      adrenaline: costOrNull(skill.adrenaline),
      upkeep: costOrNull(skill.upkeep),
      activation: skill.activation ?? null,
      aftercast: skill.aftercast ?? null,
      recharge: skill.recharge ?? null,

      pvpSplit: Boolean(skill.pvp_split),
      pvpOnly: Boolean(skill.is_pvp),
      roleplayOnly: Boolean(skill.is_rp),
    };
  })
  .filter((skill) => skill !== null)
  .filter((skill) => skill.id > 0)
  .filter((skill) => skill.name !== 'No Skill')
  .filter((skill) => !skill.pvpOnly)
  .sort((a, b) => a.name.localeCompare(b.name));

const output = {
  generatedAt: new Date().toISOString(),
  source: 'build-wars/gw-skilldata',
  totalRawRecords: allRecords.length,
  totalGameSkills: skills.length,
  skills,
};

await writeFile(outputFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`Read ${allRecords.length} raw records.`);
console.log(`Wrote ${skills.length} non-PvP English skill records.`);
console.log(`Output: ${outputFile}`);