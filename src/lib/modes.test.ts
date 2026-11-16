import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dailyAnswer,
  dailyStorageKey,
  guessPool,
  isAllowedGuess,
  modeLabel,
  randomAnswer,
} from './modes';
import { dailySkill, eliteSkills, nmDailySkill, skills } from './skills';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HM Daily is unchanged', () => {
  // Recorded from the pre-Phase-3 code. These must never change, or players
  // would see a different HM Daily answer than before.
  const PINNED_HM_DAILY: [string, number, string][] = [
    ['2025-01-01T00:00:00Z', 1339, 'Symbols of Inspiration'],
    ['2026-02-28T23:59:59Z', 215, 'Maelstrom'],
    ['2026-11-16T12:00:00Z', 1415, 'Crippling Slash'],
    ['2026-11-17T00:00:00Z', 312, 'Holy Strike'],
    ['2027-07-04T08:30:00Z', 570, 'Mark of Insecurity'],
  ];

  it.each(PINNED_HM_DAILY)('%s → %s %s', (iso, id, name) => {
    const date = new Date(iso);
    expect(dailySkill(date).id).toBe(id);
    expect(dailyAnswer('hm', date)).toMatchObject({ id, name });
  });

  it('keeps the original storage key and UTC date', () => {
    // 23:30 at UTC-5 on Nov 16 is already Nov 17 in UTC.
    const date = new Date('2026-11-17T04:30:00Z');
    expect(dailyStorageKey('hm', date)).toBe('gw-skilldle-daily-v3:2026-11-17');
  });
});

describe('NM Daily', () => {
  it('always picks an elite skill', () => {
    const start = Date.UTC(2026, 0, 1);

    for (let day = 0; day < 730; day += 1) {
      const date = new Date(start + day * 86_400_000);
      expect(dailyAnswer('nm', date).elite).toBe(true);
    }
  });

  it('is the same for the same UTC date, at any time of day', () => {
    const morning = new Date('2026-11-16T00:00:01Z');
    const night = new Date('2026-11-16T23:59:59Z');
    expect(nmDailySkill(morning).id).toBe(nmDailySkill(night).id);
  });

  it('uses its own storage key, separate from HM', () => {
    const date = new Date('2026-11-16T12:00:00Z');
    expect(dailyStorageKey('nm', date)).toBe(
      'gw-skilldle-nm-daily-v1:2026-11-16',
    );
    expect(dailyStorageKey('nm', date)).not.toBe(dailyStorageKey('hm', date));
  });

  it('is chosen independently of HM Daily', () => {
    const start = Date.UTC(2026, 0, 1);
    let sameAnswer = 0;

    for (let day = 0; day < 365; day += 1) {
      const date = new Date(start + day * 86_400_000);
      if (dailyAnswer('nm', date).id === dailyAnswer('hm', date).id) {
        sameAnswer += 1;
      }
    }

    expect(sameAnswer).toBeLessThan(10);
  });
});

describe('pools and guesses', () => {
  it('NM uses every elite skill, including PvE-only elites', () => {
    expect(guessPool('nm')).toBe(eliteSkills);
    expect(eliteSkills.every((skill) => skill.elite)).toBe(true);
    expect(eliteSkills).toHaveLength(skills.filter((s) => s.elite).length);
    expect(eliteSkills.some((skill) => skill.name === 'Ursan Blessing')).toBe(
      true,
    );
  });

  it('HM uses every skill', () => {
    expect(guessPool('hm')).toBe(skills);
  });

  it('only NM rejects non-elite guesses', () => {
    const nonElite = skills.find((skill) => !skill.elite)!;
    const elite = eliteSkills[0];
    expect(isAllowedGuess('hm', nonElite)).toBe(true);
    expect(isAllowedGuess('nm', nonElite)).toBe(false);
    expect(isAllowedGuess('nm', elite)).toBe(true);
  });

  it('Infinite NM answers are elite across the whole random range', () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(value);
      expect(randomAnswer('nm').elite).toBe(true);
    }
  });

  it('labels each combination', () => {
    expect(modeLabel('hm', 'daily')).toBe('Daily HM');
    expect(modeLabel('hm', 'infinite')).toBe('Infinite HM');
    expect(modeLabel('nm', 'daily')).toBe('Daily NM');
    expect(modeLabel('nm', 'infinite')).toBe('Infinite NM');
  });
});
