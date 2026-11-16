import scheduleData from '../data/buildle/schedule.json';
import withdrawalData from '../data/buildle/withdrawals.json';
import {
  MIN_SKILLS,
  SLOT_COUNT,
  buildleCatalogs,
  puzzleKey,
  type BuildleCatalog,
  type BuildlePuzzle,
  type BuildleVariant,
  type RoundStatus,
} from './buildle';
import { isInSkillPool, type Difficulty } from './modes';
import { dailyDateKey } from './skills';

/**
 * One Daily schedule version. Once shipped, its start date, order, and
 * catalog revision never change; a correction or expansion adds a version
 * with a later start date.
 */
export type ScheduleVersion = {
  version: number;
  catalogRevision: number;
  /** First UTC date (YYYY-MM-DD) this version applies to. */
  startsOn: string;
  seed: string;
  hm: string[];
  nm: string[];
};

/**
 * A published Daily puzzle pulled after its source data was found to be
 * wrong. Withdrawn puzzles are never replaced in place.
 */
export type Withdrawal = {
  catalogRevision: number;
  puzzleKey: string;
  withdrawnOn: string;
  /** What was wrong with the source data. */
  reason: string;
  /** What the corrected source data says. */
  correction: string;
};

export type DailyStatus = RoundStatus | 'withdrawn';

/** A Daily puzzle with its full definition, as published. */
export type DailyPuzzle = BuildlePuzzle & {
  key: string;
  catalogRevision: number;
  scheduleVersion: number;
};

export type DailyRound =
  | { kind: 'not-started'; date: string; startsOn: string | null }
  | {
      kind: 'puzzle';
      date: string;
      puzzle: DailyPuzzle;
      guessIds: number[];
      hintRevealed: boolean;
      status: DailyStatus;
      withdrawal: Withdrawal | null;
    };

export const schedules: ScheduleVersion[] = scheduleData.versions;
export const withdrawals: Withdrawal[] = withdrawalData.withdrawals;

export const DAILY_STORAGE_PREFIX = 'gw-buildle-daily-v1';

export function dailyStorageKey(difficulty: Difficulty, dateKey: string): string {
  return `${DAILY_STORAGE_PREFIX}:${difficulty}:${dateKey}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** The schedule version in force on a date: the latest one already started. */
export function scheduleFor(
  dateKey: string,
  versions: readonly ScheduleVersion[] = schedules,
): ScheduleVersion | null {
  return (
    [...versions]
      .filter((version) => version.startsOn <= dateKey)
      .sort((first, second) => second.startsOn.localeCompare(first.startsOn))[0] ?? null
  );
}

/** Day N after the version's start plays entry N, wrapping after the last. */
export function scheduledKey(
  version: ScheduleVersion,
  difficulty: Difficulty,
  dateKey: string,
): string | null {
  const list = version[difficulty];

  if (list.length === 0) {
    return null;
  }

  const index = utcDay(dateKey) - utcDay(version.startsOn);
  return list[((index % list.length) + list.length) % list.length];
}

/** Finds a puzzle by key in a catalog revision. */
export function resolvePuzzle(
  catalog: BuildleCatalog | undefined,
  key: string,
): BuildlePuzzle | null {
  if (!catalog) {
    return null;
  }

  const separator = key.lastIndexOf(':');
  const variantId = key.slice(0, separator);
  const targetId = Number(key.slice(separator + 1));

  for (const boss of catalog.bosses) {
    for (const variant of boss.variants) {
      if (variant.id === variantId && variant.skillIds.includes(targetId)) {
        return { boss: { id: boss.id, name: boss.name }, variant, targetId };
      }
    }
  }

  return null;
}

export function withdrawalFor(
  catalogRevision: number,
  key: string,
  list: readonly Withdrawal[] = withdrawals,
): Withdrawal | null {
  return (
    list.find(
      (entry) => entry.catalogRevision === catalogRevision && entry.puzzleKey === key,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Saved progress

type SavedDaily = {
  version: 1;
  date: string;
  difficulty: Difficulty;
  /** The full puzzle as published, so later data changes cannot alter it. */
  puzzle: DailyPuzzle;
  guessIds: number[];
  hintRevealed: boolean;
  status: DailyStatus;
};

const STATUSES: DailyStatus[] = ['playing', 'solved', 'gave-up', 'withdrawn'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isValidVariant(value: unknown): value is BuildleVariant {
  if (!isObject(value) || typeof value.id !== 'string' || !Array.isArray(value.skillIds)) {
    return false;
  }

  const ids = value.skillIds;
  return (
    ids.length >= MIN_SKILLS &&
    ids.length <= SLOT_COUNT &&
    ids.every((id) => typeof id === 'number' && isInSkillPool(id)) &&
    new Set(ids).size === ids.length &&
    isObject(value.encounter) &&
    Array.isArray(value.sources) &&
    Array.isArray(value.excludedTargets)
  );
}

/**
 * Reads saved progress, or null when missing or not trustworthy (bad JSON,
 * wrong date or difficulty, a bar or guess outside Skilldle's pool, or an
 * inconsistent status).
 */
export function parseSavedDaily(
  raw: string | null,
  difficulty: Difficulty,
  dateKey: string,
): SavedDaily | null {
  if (!raw) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.date !== dateKey ||
    value.difficulty !== difficulty ||
    !STATUSES.includes(value.status as DailyStatus) ||
    typeof value.hintRevealed !== 'boolean' ||
    !Array.isArray(value.guessIds) ||
    !isObject(value.puzzle)
  ) {
    return null;
  }

  const puzzle = value.puzzle;
  const guessIds = value.guessIds;

  if (
    typeof puzzle.key !== 'string' ||
    typeof puzzle.catalogRevision !== 'number' ||
    typeof puzzle.scheduleVersion !== 'number' ||
    typeof puzzle.targetId !== 'number' ||
    !isObject(puzzle.boss) ||
    typeof puzzle.boss.name !== 'string' ||
    !isValidVariant(puzzle.variant) ||
    !puzzle.variant.skillIds.includes(puzzle.targetId) ||
    puzzle.key !== puzzleKey(puzzle.variant.id, puzzle.targetId) ||
    !guessIds.every((id) => typeof id === 'number' && isInSkillPool(id)) ||
    new Set(guessIds).size !== guessIds.length
  ) {
    return null;
  }

  const solved = guessIds.includes(puzzle.targetId);
  if ((value.status === 'solved') !== solved && value.status !== 'withdrawn') {
    return null;
  }

  return value as unknown as SavedDaily;
}

/**
 * Today's Daily for a difficulty: saved progress if there is any (with the
 * puzzle exactly as it was published), otherwise the scheduled puzzle.
 * A withdrawn puzzle is shown as withdrawn, keeping any guesses.
 */
export function loadDaily(
  difficulty: Difficulty,
  date: Date,
  options: {
    storage?: Pick<Storage, 'getItem'> | null;
    versions?: readonly ScheduleVersion[];
    catalogs?: Record<number, BuildleCatalog>;
    withdrawn?: readonly Withdrawal[];
  } = {},
): DailyRound {
  const dateKey = dailyDateKey(date);
  const versions = options.versions ?? schedules;
  const catalogs = options.catalogs ?? buildleCatalogs;
  const withdrawn = options.withdrawn ?? withdrawals;

  let raw: string | null = null;
  try {
    raw = (options.storage === undefined ? window.localStorage : options.storage)?.getItem(
      dailyStorageKey(difficulty, dateKey),
    ) ?? null;
  } catch {
    // Storage unavailable: play without saved progress.
  }

  const saved = parseSavedDaily(raw, difficulty, dateKey);

  if (saved) {
    const withdrawal = withdrawalFor(saved.puzzle.catalogRevision, saved.puzzle.key, withdrawn);
    return {
      kind: 'puzzle',
      date: dateKey,
      puzzle: saved.puzzle,
      guessIds: saved.guessIds,
      hintRevealed: saved.hintRevealed,
      status: withdrawal ? 'withdrawn' : saved.status,
      withdrawal,
    };
  }

  const version = scheduleFor(dateKey, versions);
  const key = version ? scheduledKey(version, difficulty, dateKey) : null;
  const found = version && key ? resolvePuzzle(catalogs[version.catalogRevision], key) : null;

  if (!version || !key || !found) {
    const first = [...versions].sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
    return { kind: 'not-started', date: dateKey, startsOn: first?.startsOn ?? null };
  }

  const withdrawal = withdrawalFor(version.catalogRevision, key, withdrawn);
  return {
    kind: 'puzzle',
    date: dateKey,
    puzzle: {
      ...found,
      key,
      catalogRevision: version.catalogRevision,
      scheduleVersion: version.version,
    },
    guessIds: [],
    hintRevealed: false,
    status: withdrawal ? 'withdrawn' : 'playing',
    withdrawal,
  };
}

export function saveDaily(
  difficulty: Difficulty,
  round: Extract<DailyRound, { kind: 'puzzle' }>,
  storage: Pick<Storage, 'setItem'> | null = null,
): void {
  const saved: SavedDaily = {
    version: 1,
    date: round.date,
    difficulty,
    puzzle: round.puzzle,
    guessIds: round.guessIds,
    hintRevealed: round.hintRevealed,
    status: round.status,
  };

  try {
    (storage ?? window.localStorage).setItem(
      dailyStorageKey(difficulty, round.date),
      JSON.stringify(saved),
    );
  } catch {
    // The game still works if browser storage is unavailable.
  }
}
