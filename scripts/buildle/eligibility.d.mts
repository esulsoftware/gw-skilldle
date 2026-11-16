// Types for eligibility.mjs (used by the app's tests).

type PoolSkill = { id: number; name: string; elite: boolean };

export type SkillPool = {
  byName: Map<string, PoolSkill>;
  byId: Map<number, PoolSkill>;
};

export type DocumentedEntry = { name: string; monsterTemplate: boolean };

export type MappedEntry = {
  name: string;
  id: number | null;
  disallowed: string | null;
  sharesNameWith: number | null;
};

export function createSkillPool(skillData: { skills: readonly PoolSkill[] }): SkillPool;
export function mapEntries(entries: readonly DocumentedEntry[], pool: SkillPool): MappedEntry[];
export function disallowedEntries(mapped: readonly MappedEntry[]): MappedEntry[];
export function barInPool(mapped: readonly MappedEntry[]): boolean;
