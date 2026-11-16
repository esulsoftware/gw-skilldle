// Types for schedule.mjs (used by the app's tests).

type CatalogLike = {
  revision: number;
  bosses: {
    variants: {
      id: string;
      skillIds: number[];
      excludedTargets: { skillId: number; mode: string }[];
    }[];
  }[];
};

export type GeneratedSchedule = {
  version: number;
  catalogRevision: number;
  startsOn: string;
  seed: string;
  hm: string[];
  nm: string[];
};

export function puzzleKey(variantId: string, skillId: number): string;
export function seededShuffle<T>(items: readonly T[], seed: string): T[];
export function catalogPuzzleKeys(
  catalog: CatalogLike,
  mode: 'hm' | 'nm',
  isElite: (skillId: number) => boolean,
): string[];
export function buildSchedule(
  catalog: CatalogLike,
  options: { version: number; startsOn: string; isElite: (skillId: number) => boolean },
): GeneratedSchedule;
