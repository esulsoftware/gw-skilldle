// Buildle Daily schedule generation (pure).
//
// A schedule version lists every eligible puzzle of a catalog revision for
// each difficulty, in a fixed-seed shuffled order. Day N after `startsOn`
// (UTC dates, as in Skilldle) plays entry N mod length, so no puzzle repeats
// until the whole list has been played. Once shipped, a version's start
// date, order, and catalog revision never change.

/** A puzzle's stable identity within a catalog revision. */
export const puzzleKey = (variantId, skillId) => `${variantId}:${skillId}`;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of a copy, driven by a seed string. */
export function seededShuffle(items, seed) {
  const random = mulberry32(fnv1a(seed));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Puzzle keys a catalog offers for a mode (targets minus exclusions). */
export function catalogPuzzleKeys(catalog, mode, isElite) {
  const keys = [];
  for (const boss of catalog.bosses) {
    for (const variant of boss.variants) {
      const excluded = new Set(
        variant.excludedTargets.filter((e) => e.mode === mode).map((e) => e.skillId),
      );
      for (const skillId of variant.skillIds) {
        if (!excluded.has(skillId) && (mode === 'hm' || isElite(skillId))) {
          keys.push(puzzleKey(variant.id, skillId));
        }
      }
    }
  }
  return keys.sort();
}

export function buildSchedule(catalog, { version, startsOn, isElite }) {
  const elite =
    isElite ??
    (() => {
      throw new Error('buildSchedule needs isElite');
    });
  const seed = `gw-buildle-schedule-v${version}`;
  return {
    version,
    catalogRevision: catalog.revision,
    startsOn,
    seed,
    hm: seededShuffle(catalogPuzzleKeys(catalog, 'hm', elite), `${seed}:hm`),
    nm: seededShuffle(catalogPuzzleKeys(catalog, 'nm', elite), `${seed}:nm`),
  };
}
