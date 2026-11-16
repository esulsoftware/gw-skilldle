import { energyCost, typeFamily } from './compare';
import {
  allegianceAttributeName,
  campaignName,
  isRankBasedPveSkill,
  professionName,
  rankAttributeName,
  typeName,
  type Skill,
} from './skills';

export const LIBRARY_TABS = [
  'Warrior',
  'Ranger',
  'Monk',
  'Necromancer',
  'Mesmer',
  'Elementalist',
  'Assassin',
  'Ritualist',
  'Paragon',
  'Dervish',
  'PvE',
] as const;

export type LibraryTab = (typeof LIBRARY_TABS)[number];

export const ALL = 'all';

export type FilterOption = { value: string; label: string; count: number };
export type OptionSection = { label: string; options: FilterOption[] };

const byName = (first: Skill, second: Skill) =>
  first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });

const byText = (first: string, second: string) =>
  first.localeCompare(second, undefined, { sensitivity: 'base' });

/**
 * The skills a tab can show before optional filters: unchanged tab
 * membership (profession, or every rank-based skill for PvE), limited to
 * elites when NM hides non-elites.
 */
export function tabPool(
  allSkills: readonly Skill[],
  tab: LibraryTab,
  eliteOnly: boolean,
): Skill[] {
  return allSkills
    .filter((skill) =>
      tab === 'PvE'
        ? isRankBasedPveSkill(skill)
        : professionName(skill) === tab,
    )
    .filter((skill) => !eliteOnly || skill.elite);
}

// ---------------------------------------------------------------------------
// Attribute / allegiance rank

/** 0: profession attribute, 1: allegiance rank, 2: no attribute. */
function attributeGroup(skill: Skill): 0 | 1 | 2 {
  if (rankAttributeName(skill) !== null) {
    return 1;
  }

  return allegianceAttributeName(skill) === 'None' ? 2 : 0;
}

/** The attribute/rank label shown on the game board and in stat lines. */
export function attributeLabel(skill: Skill): string {
  const label = allegianceAttributeName(skill);
  return label === 'None' ? 'No attribute' : label;
}

function attributeOptionLabel(skill: Skill): string {
  const rank = rankAttributeName(skill);
  // In a menu already titled "Allegiance / rank", the prefix is noise.
  return rank ? rank.replace(/^Allegiance - /, '') : attributeLabel(skill);
}

export function attributeFilterLabel(tab: LibraryTab): string {
  return tab === 'PvE' ? 'Allegiance / rank' : 'Attribute';
}

export function allAttributesLabel(tab: LibraryTab): string {
  return tab === 'PvE' ? 'All allegiances/ranks' : 'All attributes';
}

/**
 * Attribute (or allegiance) options present in the pool: profession
 * attributes A–Z, then allegiance ranks A–Z, then "No attribute".
 */
export function attributeOptions(pool: readonly Skill[]): FilterOption[] {
  const found = new Map<string, { skill: Skill; count: number }>();

  for (const skill of pool) {
    const key = allegianceAttributeName(skill);
    const entry = found.get(key);

    if (entry) {
      entry.count += 1;
    } else {
      found.set(key, { skill, count: 1 });
    }
  }

  return [...found.entries()]
    .sort(
      ([firstKey, first], [secondKey, second]) =>
        attributeGroup(first.skill) - attributeGroup(second.skill) ||
        byText(firstKey, secondKey),
    )
    .map(([value, { skill, count }]) => ({
      value,
      label: `${attributeOptionLabel(skill)} (${count})`,
      count,
    }));
}

export function matchesAttribute(skill: Skill, filter: string): boolean {
  return filter === ALL || allegianceAttributeName(skill) === filter;
}

// ---------------------------------------------------------------------------
// Type: broad families (the existing comparison families) and exact types

const FAMILY_LABELS: Record<string, { section: string; any: string }> = {
  spell: { section: 'Spells', any: 'Any spell' },
  'melee-attack': { section: 'Melee attacks', any: 'Any melee attack' },
  'ranged-attack': { section: 'Ranged attacks', any: 'Any ranged attack' },
  ritual: { section: 'Rituals', any: 'Any ritual' },
};

const FAMILY_ORDER = ['spell', 'melee-attack', 'ranged-attack', 'ritual'];

const familyValue = (family: string) => `family:${family}`;
const typeValue = (label: string) => `type:${label}`;

/**
 * Type options present in the pool, in labelled sections. Each family
 * section starts with an "Any …" option (when it has 2+ exact types),
 * followed by its exact types. Type codes that share a label are merged.
 */
export function typeOptions(pool: readonly Skill[]): OptionSection[] {
  const exactCounts = new Map<string, number>();

  for (const skill of pool) {
    const label = typeName(skill);
    exactCounts.set(label, (exactCounts.get(label) ?? 0) + 1);
  }

  const exactLabels = [...exactCounts.keys()].sort(byText);
  const exactOption = (label: string): FilterOption => ({
    value: typeValue(label),
    label: `${label} (${exactCounts.get(label)})`,
    count: exactCounts.get(label)!,
  });

  const sections: OptionSection[] = [];

  for (const family of FAMILY_ORDER) {
    const members = exactLabels.filter((label) => typeFamily(label) === family);

    if (members.length === 0) {
      continue;
    }

    const total = members.reduce(
      (sum, label) => sum + exactCounts.get(label)!,
      0,
    );
    const options = members.map(exactOption);

    if (members.length > 1) {
      options.unshift({
        value: familyValue(family),
        label: `${FAMILY_LABELS[family].any} (${total})`,
        count: total,
      });
    }

    sections.push({ label: FAMILY_LABELS[family].section, options });
  }

  const others = exactLabels.filter((label) => typeFamily(label) === null);

  if (others.length > 0) {
    sections.push({ label: 'Other types', options: others.map(exactOption) });
  }

  return sections;
}

export function matchesType(skill: Skill, filter: string): boolean {
  if (filter === ALL) {
    return true;
  }

  const label = typeName(skill);

  if (filter.startsWith('family:')) {
    return typeFamily(label) === filter.slice('family:'.length);
  }

  return filter === typeValue(label);
}

// ---------------------------------------------------------------------------
// Sorting

export type SortKey =
  | 'name'
  | 'energy'
  | 'cast'
  | 'recharge'
  | 'attribute'
  | 'type'
  | 'campaign'
  | 'elite';

export type SortDirection = 'asc' | 'desc';

export type SortField = {
  key: SortKey;
  label: string;
  ascLabel: string;
  descLabel: string;
};

export function sortFields(tab: LibraryTab, eliteOnly: boolean): SortField[] {
  const fields: SortField[] = [
    { key: 'name', label: 'Name', ascLabel: 'A–Z', descLabel: 'Z–A' },
    { key: 'energy', label: 'Energy', ascLabel: 'Lowest first', descLabel: 'Highest first' },
    { key: 'cast', label: 'Cast time', ascLabel: 'Lowest first', descLabel: 'Highest first' },
    { key: 'recharge', label: 'Recharge', ascLabel: 'Lowest first', descLabel: 'Highest first' },
    { key: 'attribute', label: attributeFilterLabel(tab), ascLabel: 'A–Z', descLabel: 'Z–A' },
    { key: 'type', label: 'Type', ascLabel: 'A–Z', descLabel: 'Z–A' },
    { key: 'campaign', label: 'Campaign', ascLabel: 'Earliest first', descLabel: 'Latest first' },
    { key: 'elite', label: 'Elite', ascLabel: 'Elite first', descLabel: 'Non-elite first' },
  ];

  // Every visible skill is elite, so an Elite sort would do nothing.
  return eliteOnly ? fields.filter((field) => field.key !== 'elite') : fields;
}

function numericValue(skill: Skill, key: SortKey): number | null {
  switch (key) {
    case 'energy':
      return energyCost(skill); // Zero-cost (null) counts as 0.
    case 'cast':
      return skill.activation;
    case 'recharge':
      return skill.recharge;
    default:
      return null;
  }
}

/**
 * Compares two skills for a sort. Missing numeric values go last in both
 * directions; "No attribute" goes last in both directions; ties fall back
 * to name A–Z.
 */
export function compareForSort(
  first: Skill,
  second: Skill,
  key: SortKey,
  direction: SortDirection,
): number {
  const sign = direction === 'asc' ? 1 : -1;
  let result = 0;

  switch (key) {
    case 'name':
      return sign * byName(first, second);

    case 'energy':
    case 'cast':
    case 'recharge': {
      const a = numericValue(first, key);
      const b = numericValue(second, key);

      if (a === null || b === null) {
        result = a === b ? 0 : a === null ? 1 : -1;
      } else {
        result = sign * (a - b);
      }
      break;
    }

    case 'attribute':
      result =
        attributeGroup(first) - attributeGroup(second) ||
        sign *
          byText(
            allegianceAttributeName(first),
            allegianceAttributeName(second),
          );
      break;

    case 'type':
      result = sign * byText(typeName(first), typeName(second));
      break;

    case 'campaign':
      // Campaign numbers follow release order, with Core (0) earliest.
      result = sign * (first.campaign - second.campaign);
      break;

    case 'elite':
      // Ascending means elite first.
      result = sign * (Number(second.elite) - Number(first.elite));
      break;
  }

  return result || byName(first, second);
}

export function sortSkills(
  skills: readonly Skill[],
  key: SortKey,
  direction: SortDirection,
): Skill[] {
  return [...skills].sort((first, second) =>
    compareForSort(first, second, key, direction),
  );
}

// ---------------------------------------------------------------------------
// Stat line

function formatSeconds(value: number | null): string {
  return value === null ? '—' : `${value}s`;
}

/** e.g. "Fire Magic · Spell · 10 Energy · 2s cast · 20s recharge · Prophecies" */
export function skillStatLine(skill: Skill): string {
  return [
    attributeLabel(skill),
    typeName(skill),
    `${energyCost(skill)} Energy`,
    `${formatSeconds(skill.activation)} cast`,
    `${formatSeconds(skill.recharge)} recharge`,
    campaignName(skill),
  ].join(' · ');
}
