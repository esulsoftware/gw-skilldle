import { describe, expect, it } from 'vitest';
import {
  compareCampaign,
  compareNumber,
  compareType,
  energyCost,
  gradeGuess,
  resultArrow,
} from './compare';
import { skills, typeName, type Skill } from './skills';

function makeSkill(overrides: Partial<Skill>): Skill {
  return {
    id: 1,
    name: 'Test Skill',
    description: '',
    conciseDescription: '',
    campaign: 1,
    profession: 1,
    attribute: 17,
    type: 22,
    elite: false,
    energy: 5,
    adrenaline: null,
    upkeep: null,
    activation: 1,
    aftercast: 0.75,
    recharge: 10,
    pvpSplit: false,
    pvpOnly: false,
    roleplayOnly: false,
    ...overrides,
  };
}

function skillNamed(name: string): Skill {
  const skill = skills.find((candidate) => candidate.name === name);

  if (!skill) {
    throw new Error(`Missing skill fixture: ${name}`);
  }

  return skill;
}

describe('Energy comparison', () => {
  // In the data set, zero-cost skills are stored as energy: null.
  const zero = makeSkill({ id: 1, energy: null });
  const five = makeSkill({ id: 2, energy: 5 });

  it('treats a null energy cost as 0', () => {
    expect(energyCost(zero)).toBe(0);
    expect(energyCost(five)).toBe(5);
  });

  it('shows "higher" when the guess is 0 and the answer is positive', () => {
    expect(gradeGuess(zero, five).results.energy).toBe('higher');
  });

  it('shows "lower" when the guess is positive and the answer is 0', () => {
    expect(gradeGuess(five, zero).results.energy).toBe('lower');
  });

  it('shows an exact match for 0 versus 0', () => {
    const otherZero = makeSkill({ id: 3, energy: null });
    expect(gradeGuess(zero, otherZero).results.energy).toBe('correct');
  });

  it('handles numeric 0 the same as a null cost', () => {
    const numericZero = makeSkill({ id: 4, energy: 0 });
    expect(gradeGuess(numericZero, five).results.energy).toBe('higher');
    expect(gradeGuess(numericZero, zero).results.energy).toBe('correct');
  });

  it('works with real zero-cost data (adrenaline skill vs energy skill)', () => {
    const adrenalineSkill = skills.find((skill) => skill.energy === null)!;
    const energySkill = skills.find((skill) => (skill.energy ?? 0) > 0)!;
    expect(gradeGuess(adrenalineSkill, energySkill).results.energy).toBe(
      'higher',
    );
  });
});

describe('null handling outside Energy is unchanged', () => {
  it('still treats a missing value against a number as no match', () => {
    expect(compareNumber(null, 5)).toBe('none');
    expect(compareNumber(5, null)).toBe('none');
    expect(compareNumber(null, null)).toBe('correct');
  });

  it('compares Cast and Recharge numerically, including 0', () => {
    const guess = makeSkill({ id: 1, activation: 0, recharge: 0 });
    const answer = makeSkill({ id: 2, activation: 2, recharge: 20 });
    const { results } = gradeGuess(guess, answer);
    expect(results.activation).toBe('higher');
    expect(results.recharge).toBe('higher');
  });
});

describe('arrows', () => {
  it('uses ↑/↓ for numeric stats (Energy, Cast, Recharge)', () => {
    expect(resultArrow('higher', 'numeric')?.glyph).toBe('↑');
    expect(resultArrow('lower', 'numeric')?.glyph).toBe('↓');
  });

  it('uses →/← for campaigns', () => {
    expect(resultArrow('higher', 'campaign')?.glyph).toBe('→');
    expect(resultArrow('lower', 'campaign')?.glyph).toBe('←');
  });

  it('shows no arrow for exact, related, or no-match results', () => {
    for (const kind of ['numeric', 'campaign'] as const) {
      expect(resultArrow('correct', kind)).toBeNull();
      expect(resultArrow('partial', kind)).toBeNull();
      expect(resultArrow('none', kind)).toBeNull();
    }
  });
});

describe('Campaign comparison (Core is earliest)', () => {
  const CORE = 0;
  const PROPHECIES = 1;
  const NIGHTFALL = 3;
  const EYE_OF_THE_NORTH = 4;

  const inCampaign = (campaign: number, id: number) =>
    makeSkill({ id, campaign });

  it('shows → when a Core guess faces a later campaign', () => {
    const result = compareCampaign(
      inCampaign(CORE, 1),
      inCampaign(PROPHECIES, 2),
    );
    expect(result).toBe('higher');
    expect(resultArrow(result, 'campaign')?.glyph).toBe('→');
  });

  it('shows ← when a later-campaign guess faces a Core answer', () => {
    const result = compareCampaign(
      inCampaign(EYE_OF_THE_NORTH, 1),
      inCampaign(CORE, 2),
    );
    expect(result).toBe('lower');
    expect(resultArrow(result, 'campaign')?.glyph).toBe('←');
  });

  it('shows ← when the answer is earlier', () => {
    const result = compareCampaign(
      inCampaign(NIGHTFALL, 1),
      inCampaign(PROPHECIES, 2),
    );
    expect(resultArrow(result, 'campaign')?.glyph).toBe('←');
  });

  it('shows an exact match, not an arrow, for the same campaign', () => {
    const result = compareCampaign(inCampaign(CORE, 1), inCampaign(CORE, 2));
    expect(result).toBe('correct');
    expect(resultArrow(result, 'campaign')).toBeNull();
  });
});

describe('Ritual type family', () => {
  it('gives an exact match for the same ritual subtype', () => {
    expect(compareType('Nature Ritual', 'Nature Ritual')).toBe('correct');
    expect(compareType('Binding Ritual', 'Binding Ritual')).toBe('correct');
    expect(
      compareType('Ebon Vanguard Ritual', 'Ebon Vanguard Ritual'),
    ).toBe('correct');
  });

  it('gives a related match for different ritual subtypes', () => {
    expect(compareType('Nature Ritual', 'Binding Ritual')).toBe('partial');
    expect(compareType('Binding Ritual', 'Ebon Vanguard Ritual')).toBe(
      'partial',
    );
    expect(compareType('Ebon Vanguard Ritual', 'Nature Ritual')).toBe(
      'partial',
    );
  });

  it('gives no match between a ritual and an unrelated family', () => {
    expect(compareType('Nature Ritual', 'Hex Spell')).toBe('none');
    expect(compareType('Binding Ritual', 'Axe Attack')).toBe('none');
    expect(compareType('Ebon Vanguard Ritual', 'Shout')).toBe('none');
  });

  it('works with real skill data (Winds is an Ebon Vanguard Ritual)', () => {
    const winds = skillNamed('Winds');
    const natureRitual = skills.find(
      (skill) => typeName(skill) === 'Nature Ritual',
    )!;
    const bindingRitual = skills.find(
      (skill) => typeName(skill) === 'Binding Ritual',
    )!;

    expect(gradeGuess(winds, natureRitual).results.type).toBe('partial');
    expect(gradeGuess(bindingRitual, natureRitual).results.type).toBe(
      'partial',
    );
    expect(gradeGuess(winds, winds).results.type).toBe('correct');
  });

  it('leaves existing families unchanged', () => {
    expect(compareType('Hex Spell', 'Enchantment Spell')).toBe('partial');
    expect(compareType('Axe Attack', 'Sword Attack')).toBe('partial');
    expect(compareType('Bow Attack', 'Spear Attack')).toBe('partial');
    expect(compareType('Bow Attack', 'Axe Attack')).toBe('none');
  });
});
