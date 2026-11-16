import {
  dailyDateKey,
  dailySkill,
  eliteSkills,
  nmDailySkill,
  randomEliteSkill,
  randomSkill,
  skills,
  type Skill,
} from './skills';

/** HM: any skill. NM: elite skills only (answers and guesses). */
export type Difficulty = 'hm' | 'nm';

/** Daily: one saved puzzle per UTC day. Infinite: unsaved random rounds. */
export type PlayMode = 'daily' | 'infinite';

// HM Daily keeps the storage prefix it has always used, so existing saved
// progress is still found. NM Daily has its own prefix.
const DAILY_STORAGE_PREFIXES: Record<Difficulty, string> = {
  hm: 'gw-skilldle-daily-v3',
  nm: 'gw-skilldle-nm-daily-v1',
};

export function modeLabel(difficulty: Difficulty, playMode: PlayMode): string {
  const play = playMode === 'daily' ? 'Daily' : 'Infinite';
  return `${play} ${difficulty.toUpperCase()}`;
}

export function dailyStorageKey(
  difficulty: Difficulty,
  date = new Date(),
): string {
  return `${DAILY_STORAGE_PREFIXES[difficulty]}:${dailyDateKey(date)}`;
}

export function dailyAnswer(difficulty: Difficulty, date = new Date()): Skill {
  return difficulty === 'nm' ? nmDailySkill(date) : dailySkill(date);
}

export function randomAnswer(difficulty: Difficulty): Skill {
  return difficulty === 'nm' ? randomEliteSkill() : randomSkill();
}

/** Skills that may be guessed (and offered as suggestions) at a difficulty. */
export function guessPool(difficulty: Difficulty): Skill[] {
  return difficulty === 'nm' ? eliteSkills : skills;
}

export function isAllowedGuess(difficulty: Difficulty, skill: Skill): boolean {
  return difficulty === 'hm' || skill.elite;
}
