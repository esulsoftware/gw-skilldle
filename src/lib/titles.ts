// Solve titles (Hall of Monuments reward track), awarded per solve by the
// number of accepted guesses. A round that was given up earns no title.

const TITLES_BY_GUESS_COUNT = [
  'Champion of the Gods', // 1 guess
  'Legend of the Mists', // 2
  'Flameseeker', // 3
  'Ghostly Hero', // 4
  'Closer to the Stars', // 5
  'Ascendant', // 6
  'Chosen', // 7
  'Rift Warden', // 8
  'Guild Warrior', // 9
] as const;

/** The title for 10 or more guesses. */
const FALLBACK_TITLE = 'Traveler';

export type RoundOutcome = { solved: boolean; guessCount: number };

/**
 * Returns the solve title for a finished round, or null when the round was
 * given up (or the guess count is not a positive whole number).
 */
export function solveTitle({ solved, guessCount }: RoundOutcome): string | null {
  if (!solved || !Number.isInteger(guessCount) || guessCount < 1) {
    return null;
  }

  return TITLES_BY_GUESS_COUNT[guessCount - 1] ?? FALLBACK_TITLE;
}
