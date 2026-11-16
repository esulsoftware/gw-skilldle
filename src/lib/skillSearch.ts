import type { Skill } from './skills';

export const SUGGESTION_LIMIT = 50;

/**
 * Lower-cases, strips accents and apostrophes/quotes, and turns any other
 * punctuation into spaces, so `rodgorts` matches "Rodgort's Invocation" and
 * `fear me` matches "Fear Me!". Used for suggestions only, never for
 * deciding whether a submitted guess is valid.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/['’‘`"“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type SearchResult = {
  /** Up to `limit` best matches, best first. */
  matches: Skill[];
  /** How many skills matched in total. */
  total: number;
};

const byName = (first: Skill, second: Skill) =>
  first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });

/**
 * Ranks names that start with the query first, then names with a word
 * starting with it, then names containing it anywhere; alphabetical within
 * each group. An empty query lists every skill alphabetically.
 */
export function searchSkills(
  pool: readonly Skill[],
  query: string,
  limit = SUGGESTION_LIMIT,
): SearchResult {
  const normalizedQuery = normalizeForSearch(query);

  if (normalizedQuery === '') {
    const all = [...pool].sort(byName);
    return { matches: all.slice(0, limit), total: all.length };
  }

  const ranked: { skill: Skill; rank: number }[] = [];

  for (const skill of pool) {
    const name = normalizeForSearch(skill.name);
    let rank: number;

    if (name.startsWith(normalizedQuery)) {
      rank = 0;
    } else if (` ${name}`.includes(` ${normalizedQuery}`)) {
      rank = 1;
    } else if (name.includes(normalizedQuery)) {
      rank = 2;
    } else {
      continue;
    }

    ranked.push({ skill, rank });
  }

  ranked.sort(
    (first, second) =>
      first.rank - second.rank || byName(first.skill, second.skill),
  );

  return {
    matches: ranked.slice(0, limit).map((entry) => entry.skill),
    total: ranked.length,
  };
}

/** The status line shown (and announced) under the suggestions. */
export function suggestionStatus({ matches, total }: SearchResult): string {
  if (total === 0) {
    return 'No matching skills';
  }

  if (total > matches.length) {
    return `Showing ${matches.length} of ${total} matches. Keep typing to narrow the list.`;
  }

  return total === 1 ? '1 matching skill' : `${total} matching skills`;
}
