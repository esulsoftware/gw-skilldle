import {
  allegianceAttributeName,
  isRankBasedPveSkill,
  professionName,
  typeName,
  type Skill,
} from './skills';

export type Result = 'correct' | 'partial' | 'higher' | 'lower' | 'none';

export type GradedGuess = {
  skill: Skill;
  results: {
    profession: Result;
    attribute: Result;
    type: Result;
    campaign: Result;
    elite: Result;
    energy: Result;
    activation: Result;
    recharge: Result;
  };
};

/**
 * Skills with no energy cost (adrenaline skills, most signets, etc.) are
 * stored with `energy: null`. For Energy only, that means a cost of 0.
 */
export function energyCost(skill: Skill): number {
  return skill.energy ?? 0;
}

export function compareBoolean(guess: boolean, answer: boolean): Result {
  return guess === answer ? 'correct' : 'none';
}

export function compareNumber(
  guess: number | null,
  answer: number | null,
): Result {
  if (guess === null && answer === null) {
    return 'correct';
  }

  if (guess === null || answer === null) {
    return 'none';
  }

  if (guess === answer) {
    return 'correct';
  }

  return guess < answer ? 'higher' : 'lower';
}

function professionArmorClass(profession: string): string | null {
  if (['Warrior', 'Paragon'].includes(profession)) {
    return 'heavy';
  }

  if (['Ranger', 'Assassin', 'Dervish'].includes(profession)) {
    return 'medium';
  }

  if (
    ['Monk', 'Mesmer', 'Necromancer', 'Elementalist', 'Ritualist'].includes(
      profession,
    )
  ) {
    return 'light';
  }

  return null;
}

export function compareProfession(guess: string, answer: string): Result {
  if (guess === answer) {
    return 'correct';
  }

  const guessArmorClass = professionArmorClass(guess);
  const answerArmorClass = professionArmorClass(answer);

  if (guessArmorClass && guessArmorClass === answerArmorClass) {
    return 'partial';
  }

  return 'none';
}

export function typeFamily(type: string): string | null {
  const normalizedType = type.trim().toLocaleLowerCase();

  if (
    [
      'spell',
      'enchantment spell',
      'flash enchantment spell',
      'hex spell',
      'item spell',
      'ward spell',
      'weapon spell',
      'well spell',
    ].includes(normalizedType)
  ) {
    return 'spell';
  }

  if (
    [
      'melee attack',
      'axe attack',
      'hammer attack',
      'sword attack',
      'dagger attack',
      'lead attack',
      'off-hand attack',
      'dual attack',
      'scythe attack',
      'pet attack',
    ].includes(normalizedType)
  ) {
    return 'melee-attack';
  }

  if (['ranged attack', 'bow attack', 'spear attack'].includes(normalizedType)) {
    return 'ranged-attack';
  }

  if (
    ['nature ritual', 'binding ritual', 'ebon vanguard ritual'].includes(
      normalizedType,
    )
  ) {
    return 'ritual';
  }

  return null;
}

export function compareType(guess: string, answer: string): Result {
  if (guess === answer) {
    return 'correct';
  }

  const guessFamily = typeFamily(guess);
  const answerFamily = typeFamily(answer);

  if (guessFamily && guessFamily === answerFamily) {
    return 'partial';
  }

  return 'none';
}

/**
 * Campaigns compare by release order: Core (0), Prophecies (1), Factions (2),
 * Nightfall (3), Eye of the North (4). Core is treated as the earliest.
 * 'higher' means the answer is from a later campaign.
 */
export function compareCampaign(guess: Skill, answer: Skill): Result {
  if (guess.campaign === answer.campaign) {
    return 'correct';
  }

  return guess.campaign < answer.campaign ? 'higher' : 'lower';
}

export function compareAttributeOrRank(guess: Skill, answer: Skill): Result {
  const guessLabel = allegianceAttributeName(guess);
  const answerLabel = allegianceAttributeName(answer);

  if (guessLabel === answerLabel) {
    return 'correct';
  }

  const guessIsRankSkill = isRankBasedPveSkill(guess);
  const answerIsRankSkill = isRankBasedPveSkill(answer);

  if (guessIsRankSkill && answerIsRankSkill) {
    return 'partial';
  }

  return 'none';
}

export function gradeGuess(guess: Skill, answer: Skill): GradedGuess {
  return {
    skill: guess,
    results: {
      profession: compareProfession(
        professionName(guess),
        professionName(answer),
      ),
      attribute: compareAttributeOrRank(guess, answer),
      type: compareType(typeName(guess), typeName(answer)),
      campaign: compareCampaign(guess, answer),
      elite: compareBoolean(guess.elite, answer.elite),
      energy: compareNumber(energyCost(guess), energyCost(answer)),
      activation: compareNumber(guess.activation, answer.activation),
      recharge: compareNumber(guess.recharge, answer.recharge),
    },
  };
}

export type ArrowKind = 'numeric' | 'campaign';

export type Arrow = { glyph: string; label: string };

/**
 * Numeric stats use ↑/↓ (the answer's value is higher/lower).
 * Campaign uses →/← (the answer is from a later/earlier campaign).
 */
export function resultArrow(result: Result, kind: ArrowKind): Arrow | null {
  if (result === 'higher') {
    return kind === 'campaign'
      ? { glyph: '→', label: 'The answer is from a later campaign' }
      : { glyph: '↑', label: 'The answer is higher' };
  }

  if (result === 'lower') {
    return kind === 'campaign'
      ? { glyph: '←', label: 'The answer is from an earlier campaign' }
      : { glyph: '↓', label: 'The answer is lower' };
  }

  return null;
}
