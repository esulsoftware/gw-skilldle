// Buildle's skill-pool rule, as pure functions shared by the data pipeline
// and tests.
//
// Buildle may only use Skilldle's normal skill pool: exactly the skills
// Skilldle HM accepts (guessPool('hm') in src/lib/modes.ts), which is every
// record in src/data/skills.json — player skills, including normal PvE-only
// skills, with PvP-only versions removed. Boss/monster-only skills, festival
// and event skills (e.g. Wintersday), special-activity skills, and unknown
// names are not in that file, so they are outside the pool.
//
// A documented bar qualifies only if EVERY skill on it is in the pool. One
// disallowed skill makes the whole variant ineligible for NM and HM; the
// skill is never dropped, hidden, skipped, or substituted.

/** Builds the pool from the parsed contents of src/data/skills.json. */
export function createSkillPool(skillData) {
  const byName = new Map(skillData.skills.map((skill) => [skill.name.toLowerCase(), skill]));
  const byId = new Map(skillData.skills.map((skill) => [skill.id, skill]));
  return { byName, byId };
}

/**
 * Maps each documented entry to a pool skill, or records why it is not
 * allowed. Entries are never removed: the result has one item per entry.
 */
export function mapEntries(entries, pool) {
  return entries.map((entry) => {
    const match = pool.byName.get(entry.name.toLowerCase()) ?? null;

    if (entry.monsterTemplate) {
      // Written with the wiki's monster-skill template: a boss/monster-only
      // version, even when a player skill shares its name.
      return { name: entry.name, id: null, disallowed: 'monster-only skill', sharesNameWith: match?.id ?? null };
    }

    if (!match) {
      return { name: entry.name, id: null, disallowed: "not in Skilldle's skill pool", sharesNameWith: null };
    }

    return { name: entry.name, id: match.id, disallowed: null, sharesNameWith: null };
  });
}

/** The entries that make a bar ineligible (empty when the whole bar passes). */
export function disallowedEntries(mapped) {
  return mapped.filter((entry) => entry.disallowed !== null);
}

/** True only when every documented skill is in the pool. */
export function barInPool(mapped) {
  return mapped.length > 0 && disallowedEntries(mapped).length === 0;
}
