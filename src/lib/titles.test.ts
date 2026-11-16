import { describe, expect, it } from 'vitest';
import { solveTitle } from './titles';

describe('solveTitle', () => {
  it.each([
    [1, 'Champion of the Gods'],
    [2, 'Legend of the Mists'],
    [3, 'Flameseeker'],
    [4, 'Ghostly Hero'],
    [5, 'Closer to the Stars'],
    [6, 'Ascendant'],
    [7, 'Chosen'],
    [8, 'Rift Warden'],
    [9, 'Guild Warrior'],
    [10, 'Traveler'],
  ])('a solve in %i guess(es) earns "%s"', (guessCount, title) => {
    expect(solveTitle({ solved: true, guessCount })).toBe(title);
  });

  it.each([11, 12, 25, 1000])('a solve in %i guesses is still "Traveler"', (guessCount) => {
    expect(solveTitle({ solved: true, guessCount })).toBe('Traveler');
  });

  it.each([0, 1, 5, 10, 11])('giving up after %i guesses earns no title', (guessCount) => {
    expect(solveTitle({ solved: false, guessCount })).toBeNull();
  });

  it('a solved round with no valid guess count earns no title', () => {
    for (const guessCount of [0, -1, 1.5, Number.NaN]) {
      expect(solveTitle({ solved: true, guessCount })).toBeNull();
    }
  });
});
