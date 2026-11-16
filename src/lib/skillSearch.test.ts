import { describe, expect, it } from 'vitest';
import {
  normalizeForSearch,
  searchSkills,
  SUGGESTION_LIMIT,
  suggestionStatus,
} from './skillSearch';
import { eliteSkills, skills } from './skills';

const names = (result: { matches: { name: string }[] }) =>
  result.matches.map((skill) => skill.name);

describe('normalizeForSearch', () => {
  it('ignores case, apostrophes, quotes, and other punctuation', () => {
    expect(normalizeForSearch('"Fear Me!"')).toBe('fear me');
    expect(normalizeForSearch('Rodgort’s Invocation')).toBe(
      'rodgorts invocation',
    );
    expect(normalizeForSearch("Rodgort's  Invocation")).toBe(
      'rodgorts invocation',
    );
    expect(normalizeForSearch('Off-Hand')).toBe('off hand');
    expect(normalizeForSearch('  ')).toBe('');
  });
});

describe('searchSkills', () => {
  it('finds names regardless of case and punctuation', () => {
    expect(names(searchSkills(skills, 'fear me'))).toContain('"Fear Me!"');
    expect(names(searchSkills(skills, 'RODGORTS'))).toContain(
      'Rodgort\'s Invocation',
    );
  });

  it('ranks starts-with, then word-start, then contains; alphabetical within', () => {
    const pool = [
      { name: 'Mystic Sandstorm' },
      { name: 'Sandstorm' },
      { name: 'Quicksand' },
      { name: 'Sand Shards' },
    ].map((partial, index) => ({ ...skills[index], ...partial }));

    expect(names(searchSkills(pool, 'sand'))).toEqual([
      'Sand Shards',
      'Sandstorm',
      'Mystic Sandstorm',
      'Quicksand',
    ]);
  });

  it('limits suggestions to 50 and reports the full total', () => {
    const result = searchSkills(skills, 'a');
    expect(result.matches).toHaveLength(SUGGESTION_LIMIT);
    expect(result.total).toBeGreaterThan(SUGGESTION_LIMIT);
  });

  it('lists the whole pool alphabetically for an empty query', () => {
    const result = searchSkills(eliteSkills, '');
    expect(result.total).toBe(eliteSkills.length);
    const shown = names(result);
    expect(shown).toEqual(
      [...shown].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    );
  });

  it('returns nothing for no match', () => {
    expect(searchSkills(skills, 'zzzzqqq')).toEqual({ matches: [], total: 0 });
  });
});

describe('suggestionStatus', () => {
  it('describes the result', () => {
    expect(suggestionStatus({ matches: [], total: 0 })).toBe(
      'No matching skills',
    );
    expect(
      suggestionStatus({ matches: skills.slice(0, 50), total: 123 }),
    ).toBe('Showing 50 of 123 matches. Keep typing to narrow the list.');
    expect(suggestionStatus({ matches: skills.slice(0, 1), total: 1 })).toBe(
      '1 matching skill',
    );
    expect(suggestionStatus({ matches: skills.slice(0, 7), total: 7 })).toBe(
      '7 matching skills',
    );
  });
});
