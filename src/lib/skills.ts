import rawSkillData from '../data/skills.json';
import {
  attributeLabels,
  campaignLabels,
  professionLabels,
  typeLabels,
} from './skillLabels';

export type Skill = {
  id: number;
  name: string;
  description: string;
  conciseDescription: string;

  campaign: number;
  profession: number;
  attribute: number;
  type: number;

  elite: boolean;
  energy: number | null;
  adrenaline: number | null;
  upkeep: number | null;
  activation: number | null;
  aftercast: number | null;
  recharge: number | null;

  pvpSplit: boolean;
  pvpOnly: boolean;
  roleplayOnly: boolean;
};

type SkillDataFile = {
  generatedAt: string;
  source: string;
  totalRawRecords: number;
  totalGameSkills: number;
  skills: Skill[];
};

const skillData = rawSkillData as SkillDataFile;

export const skills = skillData.skills;

const professionAttributeLabels: Record<number, Record<number, string>> = {
  7: {
    29: 'Dagger Mastery',
    30: 'Deadly Arts',
    31: 'Shadow Arts',
    35: 'Critical Strikes',
  },

  8: {
    32: 'Communing',
    33: 'Restoration Magic',
    34: 'Channeling Magic',
    36: 'Spawning Power',
  },

  9: {
    37: 'Spear Mastery',
    38: 'Command',
    39: 'Motivation',
    40: 'Leadership',
  },

  10: {
    41: 'Scythe Mastery',
    42: 'Wind Prayers',
    43: 'Earth Prayers',
    44: 'Mysticism',
  },
};

function labelFor(
  labels: Record<number, string>,
  value: number,
  fallback: string,
) {
  return labels[value] ?? `${fallback} (${value})`;
}

export function campaignName(skill: Skill) {
  return labelFor(campaignLabels, skill.campaign, 'Campaign');
}

export function professionName(skill: Skill) {
  return labelFor(professionLabels, skill.profession, 'Profession');
}

export function attributeName(skill: Skill) {
  return (
    professionAttributeLabels[skill.profession]?.[skill.attribute] ??
    attributeLabels[skill.attribute] ??
    'None'
  );
}

export function typeName(skill: Skill) {
  return labelFor(typeLabels, skill.type, 'Type');
}

export function randomSkill(): Skill {
  const index = Math.floor(Math.random() * skills.length);
  return skills[index];
}

export function findSkillByName(name: string): Skill | undefined {
  const normalizedName = name.trim().toLocaleLowerCase();

  return skills.find(
    (skill) => skill.name.toLocaleLowerCase() === normalizedName,
  );
}

export function dailyDateKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function dailySkill(date = new Date()): Skill {
  const key = `gw-skilldle-v1:${dailyDateKey(date)}`;
  const index = hashString(key) % skills.length;

  return skills[index];
}