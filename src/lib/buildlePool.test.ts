import { describe, expect, it } from 'vitest';
import {
  barInPool,
  createSkillPool,
  disallowedEntries,
  mapEntries,
} from '../../scripts/buildle/eligibility.mjs';
import { skillLists } from '../../scripts/buildle/wiki.mjs';
import skillData from '../data/skills.json';
import {
  barInSkillPool,
  buildleBosses,
  checkGuess,
  datasetProblems,
  puzzleCatalog,
  skillFor,
  type BuildleBoss,
  type BuildleVariant,
} from './buildle';
import { guessPool, isInSkillPool } from './modes';
import { skills } from './skills';

// Buildle may only use Skilldle's normal skill pool. These tests cover the
// shared rule in the data pipeline (scripts/buildle/eligibility.mjs) and at
// runtime (src/lib/buildle.ts).

const pool = createSkillPool(skillData);

/** Parses one wiki "Skills" list, as the pipeline does, and maps it to the pool. */
function documentedBar(wikitext: string) {
  const [list] = skillLists(wikitext);
  return { entries: list.entries, mapped: mapEntries(list.entries, pool) };
}

const PVP_ONLY_ID = 2657; // Call of Haste (PvP): a real player skill, but PvP-only

describe("the shared pool is Skilldle's pool", () => {
  it('the pipeline pool and Skilldle HM accept exactly the same skills', () => {
    const pipelineIds = [...pool.byId.keys()].sort((a, b) => a - b);
    const skilldleIds = guessPool('hm').map((s) => s.id).sort((a, b) => a - b);
    expect(pipelineIds).toEqual(skilldleIds);
  });

  it("does not change Skilldle's own pools", () => {
    expect(guessPool('hm')).toBe(skills);
    expect(guessPool('nm').every((s) => s.elite)).toBe(true);
    expect(isInSkillPool(PVP_ONLY_ID)).toBe(false);
  });
});

describe('pipeline: the complete documented bar must pass', () => {
  it('rejects a bar with one boss/monster-only skill entirely', () => {
    const { mapped } = documentedBar(
      [
        '* {{skill icon|Chilblains}}',
        '* {{skill icon|Life Siphon}}',
        '* {{skill icon|Plague Signet}} ([[elite]])',
        '* {{monster skill icon|Stun Immunity}}',
      ].join('\n'),
    );

    expect(barInPool(mapped)).toBe(false);
    expect(disallowedEntries(mapped)).toEqual([
      expect.objectContaining({ name: 'Stun Immunity', disallowed: 'monster-only skill' }),
    ]);
  });

  it('rejects a monster-skill version even when a player skill shares its name', () => {
    const { mapped } = documentedBar(
      '* {{skill icon|Chilblains}}\n* {{skill icon|Life Siphon}}\n* {{monster skill icon|Whirlwind}}',
    );
    expect(barInPool(mapped)).toBe(false);
    expect(disallowedEntries(mapped)[0]).toMatchObject({
      name: 'Whirlwind',
      sharesNameWith: 163,
    });
  });

  it('rejects a bar with a player-usable Wintersday skill entirely', () => {
    const { mapped } = documentedBar(
      '* {{skill icon|Snowball}}\n* {{skill icon|Mega Snowball}}\n* {{skill icon|Healing Breeze}}',
    );
    expect(barInPool(mapped)).toBe(false);
    expect(disallowedEntries(mapped).map((e) => e.name)).toEqual(['Snowball', 'Mega Snowball']);
  });

  it('rejects special replacement-bar, PvP-only, and unknown skills', () => {
    for (const name of ['Choking Breath', 'Celestial Stance', 'Call of Haste (PvP)', 'Not A Real Skill']) {
      const { mapped } = documentedBar(
        `* {{skill icon|Chilblains}}\n* {{skill icon|Life Siphon}}\n* {{skill icon|${name}}}`,
      );
      expect(barInPool(mapped)).toBe(false);
    }
  });

  it('never silently drops an unsupported skill from the bar', () => {
    const { entries, mapped } = documentedBar(
      '* {{skill icon|Chilblains}}\n* {{skill icon|Snowball}}\n* {{skill icon|Life Siphon}}\n* {{skill icon|Signet of Agony}}',
    );
    expect(mapped).toHaveLength(entries.length);
    expect(mapped.map((e) => e.name)).toContain('Snowball');
    expect(barInPool(mapped)).toBe(false);
  });

  it('accepts normal PvE-only skills that Skilldle already uses', () => {
    const { mapped } = documentedBar(
      '* {{skill icon|Winds}}\n* {{skill icon|Ebon Battle Standard of Honor}}\n* {{skill icon|Signet of Capture}}',
    );
    expect(barInPool(mapped)).toBe(true);
    expect(mapped.every((e) => e.id !== null && isInSkillPool(e.id))).toBe(true);
  });
});

describe('runtime: shipped data and puzzles stay inside the pool', () => {
  const variant = (id: string, skillIds: number[]): BuildleVariant => ({
    id,
    skillIds,
    encounter: { campaign: 'Core', locations: [], details: [] },
    sources: [{ site: 'Test', url: `https://example.test/${id}`, revisionId: 1 }],
    checkedOn: '2026-11-16',
    excludedTargets: [],
    notes: [],
  });

  it('a bar with one skill outside the pool offers no NM or HM puzzle, not even its elite', () => {
    // Chilblains, Life Siphon, Plague Signet (elite), and a PvP-only skill.
    const mixed: BuildleBoss = {
      id: 'mixed',
      name: 'Mixed',
      variants: [variant('mixed', [144, 109, 132, PVP_ONLY_ID])],
    };

    expect(barInSkillPool(mixed.variants[0])).toBe(false);
    expect(datasetProblems([mixed]).join('\n')).toMatch(/2657 is outside Skilldle's skill pool/);
    expect(puzzleCatalog([mixed], 'hm').puzzles).toEqual([]);
    expect(puzzleCatalog([mixed], 'nm').puzzles).toEqual([]);
  });

  it('every revealed skill and hidden target in every shipped variant is in the pool', () => {
    for (const b of buildleBosses) {
      for (const v of b.variants) {
        expect(v.skillIds.every(isInSkillPool)).toBe(true);
      }
    }
    for (const mode of ['hm', 'nm'] as const) {
      for (const p of puzzleCatalog(buildleBosses, mode).puzzles) {
        expect(isInSkillPool(p.targetId)).toBe(true);
        expect(p.variant.skillIds.every(isInSkillPool)).toBe(true);
        if (mode === 'nm') {
          expect(skillFor(p.targetId).elite).toBe(true);
        }
      }
    }
  });

  it('guess validation accepts only pool skills (NM: its elite subset)', () => {
    const p = puzzleCatalog(buildleBosses, 'hm').puzzles[0];
    expect(checkGuess('Snowball', p, 'hm', []).kind).toBe('invalid');
    expect(checkGuess('Call of Haste (PvP)', p, 'hm', []).kind).toBe('invalid');
    expect(checkGuess('Stun Immunity', p, 'hm', []).kind).toBe('invalid');
    expect(checkGuess('Winds', p, 'hm', []).kind).not.toBe('invalid'); // normal PvE skill
    expect(checkGuess('Winds', p, 'nm', []).kind).toBe('not-elite');
  });
});
