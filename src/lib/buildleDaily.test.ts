import { describe, expect, it } from 'vitest';
import type { BuildleCatalog, BuildleVariant } from './buildle';
import {
  DAILY_STORAGE_PREFIX,
  dailyStorageKey,
  loadDaily,
  parseSavedDaily,
  saveDaily,
  scheduleFor,
  scheduledKey,
  type ScheduleVersion,
  type Withdrawal,
} from './buildleDaily';
import { dailyStorageKey as skilldleStorageKey } from './modes';

const variant = (id: string, skillIds: number[]): BuildleVariant => ({
  id,
  skillIds,
  encounter: { campaign: 'Prophecies', locations: [], details: [] },
  sources: [{ site: 'Guild Wars Wiki', url: `https://wiki.example/${id}`, revisionId: 1 }],
  checkedOn: '2026-11-16',
  excludedTargets: [],
  notes: [],
});

// Chilblains, Life Siphon, Plague Signet (elite), Signet of Agony
const catalogV1: BuildleCatalog = {
  revision: 1,
  attribution: 'test',
  bosses: [{ id: 'grawl', name: 'Grawl', variants: [variant('grawl', [144, 109, 132, 145])] }],
};

const v1: ScheduleVersion = {
  version: 1,
  catalogRevision: 1,
  startsOn: '2026-11-16',
  seed: 'test',
  hm: ['grawl:144', 'grawl:109', 'grawl:145'],
  nm: ['grawl:132'],
};

const v2: ScheduleVersion = { ...v1, version: 2, startsOn: '2026-12-01', hm: ['grawl:132'] };

const at = (iso: string) => new Date(iso);

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const load = (
  difficulty: 'hm' | 'nm',
  date: Date,
  storage = memoryStorage(),
  extra: { versions?: ScheduleVersion[]; catalogs?: Record<number, BuildleCatalog>; withdrawn?: Withdrawal[] } = {},
) =>
  loadDaily(difficulty, date, {
    storage,
    versions: extra.versions ?? [v1],
    catalogs: extra.catalogs ?? { 1: catalogV1 },
    withdrawn: extra.withdrawn ?? [],
  });

const keyOf = (round: ReturnType<typeof loadDaily>) =>
  round.kind === 'puzzle' ? round.puzzle.key : null;

describe('deterministic Daily selection', () => {
  it('the same date always gives the same puzzle', () => {
    expect(keyOf(load('hm', at('2026-11-17T01:00:00Z')))).toBe(
      keyOf(load('hm', at('2026-11-17T23:00:00Z'))),
    );
  });

  it('plays the schedule in order from its start date, then wraps', () => {
    const days = ['16', '17', '18', '19'].map((d) => keyOf(load('hm', at(`2026-11-${d}T12:00:00Z`))));
    expect(days).toEqual(['grawl:144', 'grawl:109', 'grawl:145', 'grawl:144']);
  });

  it('switches day at midnight UTC, like Skilldle', () => {
    expect(keyOf(load('hm', at('2026-11-16T23:59:59Z')))).toBe('grawl:144');
    expect(keyOf(load('hm', at('2026-11-17T00:00:00Z')))).toBe('grawl:109');
  });

  it('NM and HM have separate schedules', () => {
    expect(keyOf(load('nm', at('2026-11-16T12:00:00Z')))).toBe('grawl:132');
    expect(keyOf(load('hm', at('2026-11-16T12:00:00Z')))).toBe('grawl:144');
  });
});

describe('schedule boundaries and versions', () => {
  it('has no Daily before the first version starts', () => {
    const round = load('hm', at('2026-11-15T23:59:59Z'));
    expect(round).toEqual({ kind: 'not-started', date: '2026-11-15', startsOn: '2026-11-16' });
  });

  it('uses the latest version that has started; earlier dates keep the earlier version', () => {
    const versions = [v1, v2];
    expect(scheduleFor('2026-11-30', versions)?.version).toBe(1);
    expect(scheduleFor('2026-12-01', versions)?.version).toBe(2);
    expect(keyOf(load('hm', at('2026-11-30T12:00:00Z'), memoryStorage(), { versions }))).toBe(
      scheduledKey(v1, 'hm', '2026-11-30'),
    );
    expect(keyOf(load('hm', at('2026-12-01T12:00:00Z'), memoryStorage(), { versions }))).toBe('grawl:132');
  });
});

describe('saved progress', () => {
  it('restores guesses, hint, and status after a refresh', () => {
    const storage = memoryStorage();
    const first = load('hm', at('2026-11-16T12:00:00Z'), storage);
    if (first.kind !== 'puzzle') throw new Error('expected a puzzle');

    saveDaily('hm', { ...first, guessIds: [109, 1], hintRevealed: true, status: 'gave-up' }, storage);
    const again = load('hm', at('2026-11-16T20:00:00Z'), storage);

    expect(again).toMatchObject({ guessIds: [109, 1], hintRevealed: true, status: 'gave-up' });
  });

  it('keeps the puzzle exactly as published, even if the catalog later changes', () => {
    const storage = memoryStorage();
    const first = load('hm', at('2026-11-16T12:00:00Z'), storage);
    if (first.kind !== 'puzzle') throw new Error('expected a puzzle');
    saveDaily('hm', first, storage);

    const changed: BuildleCatalog = {
      ...catalogV1,
      bosses: [{ id: 'grawl', name: 'Renamed', variants: [variant('grawl', [144, 109, 132, 145, 446])] }],
    };
    const again = load('hm', at('2026-11-16T13:00:00Z'), storage, { catalogs: { 1: changed } });

    expect(again.kind === 'puzzle' && again.puzzle.variant.skillIds).toEqual([144, 109, 132, 145]);
    expect(again.kind === 'puzzle' && again.puzzle.boss.name).toBe('Grawl');
  });

  it('uses separate keys for NM, HM, and each date, apart from Skilldle', () => {
    const date = '2026-11-16';
    expect(dailyStorageKey('hm', date)).toBe(`${DAILY_STORAGE_PREFIX}:hm:${date}`);
    expect(dailyStorageKey('nm', date)).not.toBe(dailyStorageKey('hm', date));
    expect(dailyStorageKey('hm', '2026-11-17')).not.toBe(dailyStorageKey('hm', date));
    for (const difficulty of ['hm', 'nm'] as const) {
      expect(dailyStorageKey(difficulty, date)).toMatch(/^gw-buildle-/);
      expect(skilldleStorageKey(difficulty, at(`${date}T12:00:00Z`))).toMatch(/^gw-skilldle-/);
    }
  });
});

describe('corrupt saved state is ignored', () => {
  const date = '2026-11-16';
  const good = () => {
    const round = load('hm', at(`${date}T12:00:00Z`));
    if (round.kind !== 'puzzle') throw new Error('expected a puzzle');
    return {
      version: 1,
      date,
      difficulty: 'hm',
      puzzle: round.puzzle,
      guessIds: [109],
      hintRevealed: false,
      status: 'playing',
    };
  };
  const parse = (value: unknown) =>
    parseSavedDaily(typeof value === 'string' ? value : JSON.stringify(value), 'hm', date);

  it('accepts a well-formed save', () => {
    expect(parse(good())).not.toBeNull();
  });

  it.each([
    ['bad JSON', '{not json'],
    ['wrong shape', '[1,2,3]'],
    ['another date', { ...good(), date: '2026-11-15' }],
    ['another difficulty', { ...good(), difficulty: 'nm' }],
    ['unknown status', { ...good(), status: 'won' }],
    ['guess outside the pool', { ...good(), guessIds: [999999] }],
    ['repeated guess', { ...good(), guessIds: [109, 109] }],
    ['"solved" without the answer guessed', { ...good(), status: 'solved' }],
    ['answer guessed but still "playing"', { ...good(), guessIds: [144] }],
    ['target not in the bar', { ...good(), puzzle: { ...good().puzzle, targetId: 446, key: 'grawl:446' } }],
    ['bar with a skill outside the pool', {
      ...good(),
      puzzle: { ...good().puzzle, variant: { ...good().puzzle.variant, skillIds: [144, 109, 2657] } },
    }],
    ['bar too short', {
      ...good(),
      puzzle: { ...good().puzzle, variant: { ...good().puzzle.variant, skillIds: [144, 109] } },
    }],
  ])('rejects %s', (_, value) => {
    expect(parse(value)).toBeNull();
  });

  it('a corrupt save falls back to the scheduled puzzle with no progress', () => {
    const storage = memoryStorage();
    storage.setItem(dailyStorageKey('hm', date), '{broken');
    expect(load('hm', at(`${date}T12:00:00Z`), storage)).toMatchObject({
      kind: 'puzzle',
      guessIds: [],
      status: 'playing',
    });
  });
});

describe('withdrawn puzzles', () => {
  const withdrawal: Withdrawal = {
    catalogRevision: 1,
    puzzleKey: 'grawl:144',
    withdrawnOn: '2026-11-20',
    reason: 'The wiki listed the wrong skill.',
    correction: 'Grawl uses Mark of Pain instead of Chilblains.',
  };

  it('marks a started Daily withdrawn and keeps its guesses', () => {
    const storage = memoryStorage();
    const first = load('hm', at('2026-11-16T12:00:00Z'), storage);
    if (first.kind !== 'puzzle') throw new Error('expected a puzzle');
    saveDaily('hm', { ...first, guessIds: [109, 1] }, storage);

    const again = load('hm', at('2026-11-16T13:00:00Z'), storage, { withdrawn: [withdrawal] });
    expect(again).toMatchObject({ status: 'withdrawn', guessIds: [109, 1], withdrawal });
  });

  it('a completed Daily is shown as withdrawn too, never as won', () => {
    const storage = memoryStorage();
    const first = load('hm', at('2026-11-16T12:00:00Z'), storage);
    if (first.kind !== 'puzzle') throw new Error('expected a puzzle');
    saveDaily('hm', { ...first, guessIds: [144], status: 'solved' }, storage);

    expect(load('hm', at('2026-11-16T13:00:00Z'), storage, { withdrawn: [withdrawal] })).toMatchObject({
      status: 'withdrawn',
      guessIds: [144],
    });
  });

  it('an unstarted withdrawn Daily is withdrawn, not silently replaced', () => {
    const round = load('hm', at('2026-11-16T12:00:00Z'), memoryStorage(), { withdrawn: [withdrawal] });
    expect(round).toMatchObject({ status: 'withdrawn', guessIds: [] });
    expect(keyOf(round)).toBe('grawl:144');
  });

  it('other dates are unaffected', () => {
    const round = load('hm', at('2026-11-17T12:00:00Z'), memoryStorage(), { withdrawn: [withdrawal] });
    expect(round).toMatchObject({ status: 'playing', withdrawal: null });
  });
});
