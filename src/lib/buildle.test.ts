import { describe, expect, it } from 'vitest';
import {
  HINT_AFTER_INCORRECT,
  SLOT_COUNT,
  buildSlots,
  buildleBosses,
  checkGuess,
  datasetProblems,
  eligibleTargets,
  hintAvailable,
  puzzleCatalog,
  randomPuzzle,
  skillFor,
  type BuildleBoss,
  type BuildlePuzzle,
  type BuildleVariant,
} from './buildle';

function variant(id: string, skillIds: number[]): BuildleVariant {
  return {
    id,
    skillIds,
    encounter: { campaign: 'Core', locations: [], details: [] },
    sources: [{ site: 'Test', url: `https://example.test/${id}`, revisionId: 1 }],
    checkedOn: '2026-11-16',
    excludedTargets: [],
    notes: [],
  };
}

const boss = (name: string, ...variants: BuildleVariant[]): BuildleBoss => ({
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  variants,
});

// Chilblains, Life Siphon, Plague Signet (elite), Signet of Agony, Troll Unguent
const fiveSkill = boss('Five Skill', variant('five', [144, 109, 132, 145, 446]));
// Glimmering Mark (elite), Migraine (elite), Conjure Lightning, Whirlwind
const twoElite = boss('Two Elite', variant('two-elite', [227, 53, 221, 163]));

const puzzle = (b: BuildleBoss, targetId: number): BuildlePuzzle => ({
  boss: b,
  variant: b.variants[0],
  targetId,
});

const revealedNames = (b: BuildleBoss, targetId: number) =>
  buildSlots(puzzle(b, targetId), 'playing').flatMap((s) =>
    s.kind === 'revealed' ? [s.skill.name] : [],
  );

describe('dataset', () => {
  it('the shipped data is valid: known skills, 3–8 per bar, sourced, no repeats', () => {
    expect(datasetProblems(buildleBosses)).toEqual([]);
    expect(buildleBosses.length).toBeGreaterThan(0);
  });

  it('every variant has 3–8 skills, both sources with revisions, a check date, and context', () => {
    for (const b of buildleBosses) {
      for (const v of b.variants) {
        expect(v.skillIds.length).toBeGreaterThanOrEqual(3);
        expect(v.skillIds.length).toBeLessThanOrEqual(8);
        expect(v.sources.map((s) => s.site)).toEqual(['Guild Wars Wiki', 'GuildWiki']);
        expect(v.sources.every((s) => s.url.startsWith('https://') && s.revisionId)).toBe(true);
        expect(v.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(v.encounter.campaign).toBeTruthy();
        expect(Array.isArray(v.encounter.details)).toBe(true);
      }
    }
  });

  it('flags oversized, short, repeated, unknown, unsourced, and bad exclusions', () => {
    const bad = boss(
      'Bad',
      variant('too-big', [1, 2, 3, 4, 5, 6, 7, 8, 9]),
      variant('too-small', [144, 109]),
      { ...variant('repeat', [144, 144, 109]), sources: [] },
      variant('unknown', [999999, 144, 109]),
      {
        ...variant('bad-exclusion', [144, 109, 132]),
        excludedTargets: [{ skillId: 1, mode: 'hm', reason: 'ambiguous' }],
      },
    );
    const problems = datasetProblems([bad]).join('\n');
    expect(problems).toMatch(/too-big.*9 skills/);
    expect(problems).toMatch(/too-small.*2 skills \(must be 3–8\)/);
    expect(problems).toMatch(/repeat.*repeated skill/);
    expect(problems).toMatch(/repeat.*no source/);
    expect(problems).toMatch(/skill ID 999999 is outside Skilldle's skill pool/);
    expect(problems).toMatch(/bad-exclusion.*excluded target 1/);
  });
});

describe('target eligibility', () => {
  it('NM hides only elites; HM may hide any skill, elite or not', () => {
    expect(eligibleTargets(fiveSkill.variants[0], 'nm')).toEqual([132]);
    expect(eligibleTargets(fiveSkill.variants[0], 'hm')).toEqual([144, 109, 132, 145, 446]);
  });

  it('never hides a target the dataset excludes for that mode', () => {
    const v = {
      ...variant('excluding', [144, 109, 132, 145, 446]),
      excludedTargets: [
        { skillId: 109, mode: 'hm', reason: 'ambiguous' },
        { skillId: 132, mode: 'nm', reason: 'ambiguous' },
      ],
    };
    expect(eligibleTargets(v, 'hm')).toEqual([144, 132, 145, 446]);
    expect(eligibleTargets(v, 'nm')).toEqual([]);
  });

  it('a bar without an elite cannot supply an NM puzzle', () => {
    const noElite = boss('No Elite', variant('none', [469, 854, 1211]));
    expect(puzzleCatalog([noElite], 'nm').puzzles).toEqual([]);
    expect(puzzleCatalog([noElite], 'hm').puzzles).toHaveLength(3);
  });

  it('NM with two elites hides exactly one and shows the other', () => {
    expect(eligibleTargets(twoElite.variants[0], 'nm')).toEqual([227, 53]);

    const slots = buildSlots(puzzle(twoElite, 227), 'playing');
    expect(slots.filter((s) => s.kind === 'missing')).toHaveLength(1);
    expect(revealedNames(twoElite, 227)).toContain('Migraine');
    expect(revealedNames(twoElite, 227)).not.toContain('Glimmering Mark');
  });

  it('real data: NM targets are all elite; HM includes non-elite targets', () => {
    const nm = puzzleCatalog(buildleBosses, 'nm').puzzles;
    const hm = puzzleCatalog(buildleBosses, 'hm').puzzles;
    expect(nm.length).toBeGreaterThan(0);
    expect(nm.every((p) => skillFor(p.targetId).elite)).toBe(true);
    expect(hm.some((p) => skillFor(p.targetId).elite)).toBe(true);
    expect(hm.some((p) => !skillFor(p.targetId).elite)).toBe(true);
  });

  it('real data: excluded targets are never offered', () => {
    for (const mode of ['hm', 'nm'] as const) {
      for (const p of puzzleCatalog(buildleBosses, mode).puzzles) {
        expect(
          p.variant.excludedTargets.some((e) => e.mode === mode && e.skillId === p.targetId),
        ).toBe(false);
      }
    }
  });
});

describe('ambiguous clues', () => {
  // Same three visible skills and bar size, different hidden skills.
  const first = boss('First', variant('first', [408, 406, 464, 446]));
  const second = boss('Second', variant('second', [408, 406, 464, 469]));

  it('leaves out puzzles whose visible clue matches another puzzle with a different answer', () => {
    const { puzzles, ambiguous } = puzzleCatalog([first, second], 'hm');
    expect(ambiguous.map((p) => p.targetId).sort()).toEqual([446, 469]);
    expect(puzzles.some((p) => p.targetId === 446 || p.targetId === 469)).toBe(false);
    // Hiding a shared skill leaves a distinct clue, so those remain.
    expect(puzzles.filter((p) => p.targetId === 408)).toHaveLength(2);
  });

  it('compares the rendered clue, so source order does not matter', () => {
    const shuffled = boss('Shuffled', variant('shuffled', [469, 464, 406, 408]));
    const { ambiguous } = puzzleCatalog([first, shuffled], 'hm');
    expect(ambiguous.map((p) => p.targetId).sort()).toEqual([446, 469]);
  });

  it('the same answer behind the same clue is not ambiguous', () => {
    const twin = boss('Twin', variant('twin', [408, 406, 464, 446]));
    expect(puzzleCatalog([first, twin], 'hm').ambiguous).toEqual([]);
  });
});

describe('eight-slot bar', () => {
  it('a five-skill bar shows four skills, one missing slot, and three unused slots', () => {
    const slots = buildSlots(puzzle(fiveSkill, 109), 'playing');
    expect(slots).toHaveLength(SLOT_COUNT);
    expect(slots.map((s) => s.kind)).toEqual([
      'revealed', 'revealed', 'revealed', 'revealed', 'missing', 'unused', 'unused', 'unused',
    ]);
  });

  it('the missing slot is in the same place whichever skill is hidden', () => {
    const positions = fiveSkill.variants[0].skillIds.map((id) =>
      buildSlots(puzzle(fiveSkill, id), 'playing').findIndex((s) => s.kind === 'missing'),
    );
    expect(new Set(positions)).toEqual(new Set([4]));
  });

  it('shows visible skills in name order, whatever the source order', () => {
    const reordered = boss('Reordered', variant('reordered', [446, 145, 132, 109, 144]));
    expect(revealedNames(reordered, 132)).toEqual(revealedNames(fiveSkill, 132));
    expect(revealedNames(fiveSkill, 132)).toEqual([
      'Chilblains', 'Life Siphon', 'Signet of Agony', 'Troll Unguent',
    ]);
  });

  it('a solved or given-up round shows the target in its slot, marked by outcome', () => {
    expect(buildSlots(puzzle(fiveSkill, 109), 'solved')[4]).toEqual({
      kind: 'answer', skill: skillFor(109), status: 'solved',
    });
    expect(buildSlots(puzzle(fiveSkill, 109), 'gave-up')[4]).toEqual({
      kind: 'answer', skill: skillFor(109), status: 'gave-up',
    });
  });

  it('a full bar has no unused slots', () => {
    const eight = buildleBosses.find((b) => b.variants[0].skillIds.length === 8)!;
    const slots = buildSlots(puzzle(eight, eight.variants[0].skillIds[0]), 'playing');
    expect(slots.filter((s) => s.kind === 'unused')).toHaveLength(0);
  });
});

describe('guesses: right or wrong only', () => {
  const p = puzzle(fiveSkill, 132); // Plague Signet

  it('accepts the hidden skill as correct (case and spacing ignored)', () => {
    expect(checkGuess('  plague SIGNET ', p, 'hm', []).kind).toBe('correct');
  });

  it('a visible skill from the same bar is incorrect, not a win', () => {
    expect(checkGuess('Life Siphon', p, 'hm', []).kind).toBe('incorrect');
  });

  it('rejects unknown names and duplicates without recording them', () => {
    expect(checkGuess('Not a skill', p, 'hm', []).kind).toBe('invalid');
    expect(checkGuess('Life Siphon', p, 'hm', [109]).kind).toBe('duplicate');
  });

  it('NM rejects non-elite guesses; HM accepts them', () => {
    expect(checkGuess('Life Siphon', p, 'nm', []).kind).toBe('not-elite');
    expect(checkGuess('Migraine', p, 'nm', []).kind).toBe('incorrect');
    expect(checkGuess('Life Siphon', p, 'hm', []).kind).toBe('incorrect');
  });
});

describe('boss-name hint', () => {
  it(`becomes available after ${HINT_AFTER_INCORRECT} incorrect guesses, not before`, () => {
    expect(hintAvailable(HINT_AFTER_INCORRECT - 1)).toBe(false);
    expect(hintAvailable(HINT_AFTER_INCORRECT)).toBe(true);
    expect(hintAvailable(HINT_AFTER_INCORRECT + 3)).toBe(true);
  });
});

describe('randomPuzzle', () => {
  const { puzzles } = puzzleCatalog([fiveSkill], 'hm');

  it('picks from the catalog and avoids repeating the previous round', () => {
    expect(randomPuzzle(puzzles, () => 0)).toBe(puzzles[0]);
    expect(randomPuzzle(puzzles, () => 0, puzzles[0])).toBe(puzzles[1]);
    expect(randomPuzzle([], () => 0)).toBeNull();
  });
});
