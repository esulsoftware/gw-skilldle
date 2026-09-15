import { readFile } from 'node:fs/promises';

const rawText = await readFile('src/data/skills.raw.json', 'utf8');
const rawData = JSON.parse(rawText);

const wantedName = '"Stand Your Ground!"';

const matches = Object.values(rawData.skilldata).filter((skill) => {
  const name = skill.lang?.en?.name ?? skill.lang?.['en-gww']?.name;
  return name === wantedName;
});

console.log(`Found ${matches.length} record(s).`);

for (const skill of matches) {
  console.log('\n---');
  console.log('ID:', skill.id);
  console.log('is_pvp:', skill.is_pvp);
  console.log('pvp_split:', skill.pvp_split);
  console.log('campaign:', skill.campaign);
  console.log('profession:', skill.profession);
  console.log('attribute:', skill.attribute);
  console.log('type:', skill.type);
  console.log('energy:', skill.energy);
  console.log('adrenaline:', skill.adrenaline);
  console.log('activation:', skill.activation);
  console.log('recharge:', skill.recharge);
  console.log('English:', skill.lang?.en);
  console.log('GWW English:', skill.lang?.['en-gww']);
}