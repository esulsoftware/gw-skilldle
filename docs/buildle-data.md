# Buildle data: sources, pipeline, Daily schedule, and reuse

## What Buildle uses

| Data | Where it comes from | Stored in |
|---|---|---|
| Boss skill bars (which skills a boss uses) | Guild Wars Wiki boss pages, cross-checked against GuildWiki | `src/data/buildle/catalog-r1.json` (skill IDs, page URLs, revision IDs, check date) |
| Daily schedule | Generated from the catalog with a fixed seed | `src/data/buildle/schedule.json` |
| Withdrawn Daily puzzles | Maintained by hand when source data is corrected | `src/data/buildle/withdrawals.json` |
| Skill names, stats, descriptions | `build-wars/gw-skilldata` (existing Skilldle data) | `src/data/skills.json` |
| Skill icons | Guild Wars Wiki image files (ArenaNet artwork) | `public/skill-icons/` |

Buildle stores **facts** (which skill IDs a boss uses), not wiki prose. Each
variant records both source pages with the exact revision that was read.
All Buildle data is loaded in its own chunk, only when Buildle is opened.

## Pipeline

```sh
npm run buildle:fetch     # boss pages from both wikis, plus wiki categories (cache is git-ignored)
npm run buildle:build     # classify, cross-check, find ambiguity, write reports and candidates
npm run buildle:build -- --release [--start-date YYYY-MM-DD] [--replace-unreleased]
                          # write catalog r1 and schedule v1 (refuses to change published files)
```

`buildle:build` writes:

- `docs/buildle-data-report.md` — totals, exclusions by reason, overlapping
  flags, disallowed skills, event-only encounters, and ambiguous targets.
- `docs/buildle-variants.csv` — one row per documented skill list with its
  outcome, flags, disallowed skills, and any event-only reason.
- `docs/buildle-disallowed-skills.csv` — every skill outside Skilldle's pool
  on any boss list, with its reason, wiki categories, the list's other
  skills, and the source revision (audit record; never playable).
- `scripts/buildle/output/buildle-candidates.json` (git-ignored) — the
  candidate catalog, in the same format as the shipped catalog.

Re-run both steps whenever the data should change; ambiguity is recomputed
across the whole corpus every time. A new fetch may differ from the cached
pages behind revision 1 — that is expected, and any change ships as a new
revision (below), never by editing r1.

## v1 criteria

A variant (one documented skill list) is eligible only when **both**
independent requirements hold, plus the data checks:

**A. Skill pool.** Every skill on the documented bar is in Skilldle's normal
skill pool — exactly the skills Skilldle HM accepts (`guessPool('hm')`, i.e.
every record in `src/data/skills.json`: player skills including normal
PvE-only skills, without PvP-only versions). One boss/monster-only,
festival/event (e.g. Wintersday snow fighting), special replacement-bar
(Junundu, Celestial, Devourer), PvP-only, or unknown skill excludes the whole
variant for NM and HM; it is never dropped, hidden, skipped, or substituted.
The rule is in `scripts/buildle/eligibility.mjs` and `isInSkillPool()` in
`src/lib/modes.ts`, and tests check both agree. Buildle's guesses and
suggestions use the same pool (NM: its elites).

**B. Encounter.** The boss is not a documented event/festival-only encounter
(`scripts/buildle/encounters.mjs`): its wiki page is not in an event NPC
category (e.g. "Wintersday NPCs", "Canthan New Year NPCs"), and not every
documented location is tied to an event quest or page (e.g. "only during
[[The Knights Who Say Nian]]"). Negative conditions ("not during …") never
count as event-only; bosses that also appear outside events, and ordinary
quest bosses, are kept. Names are never used to guess.

**Data checks.**

1. 3–8 distinct skills.
2. The page documents a single list, with no labels, per-skill conditions,
   stub/verify markers, or notes naming other skills. Multi-list and
   conditional encounters are deferred, never merged.
3. GuildWiki lists exactly the same skills. This is a **cross-check between two
   community wikis, not proof of in-game accuracy.**
4. Targets are dropped (per mode) when another documented list — including
   short, conditional, conflicting, or GuildWiki-only lists outside the
   release — shows the same clue (same visible skills and bar size) with a
   different answer.

NM additionally needs at least one eligible elite target.

## Daily schedule, revisions, and immutability

- **Current status: provisional and unreleased.** `schedule.json` is marked
  `"status": "provisional-unreleased"` with a provisional start date of
  2026-11-16 for preview testing. The production launch date is not yet
  confirmed; the final release regenerates it with the confirmed date and
  `--release-status released`.
- `schedule.json` holds schedule **versions**. Each names a catalog revision,
  a start date (UTC, as Skilldle), a seed, and fixed-seed shuffled lists of
  puzzle keys (`variantId:skillId`) for HM and NM. Day N after the start plays
  entry N, wrapping after the last, so nothing repeats until the list ends.
- The latest version whose start date has passed is in force; earlier dates
  keep their own version.
- **Once shipped, a catalog revision and a schedule version never change.**
  Corrections or new bosses go in `catalog-r2.json` and a schedule version 2
  with a later start date. `--release` refuses to overwrite published files,
  and tests pin their hashes. `--replace-unreleased` exists only for changes
  before the first release (e.g. confirming the launch date).
- Saved Daily progress (`gw-buildle-daily-v1:<hm|nm>:<date>`) stores the
  puzzle exactly as published (bar, target, boss, sources), plus schedule
  version, accepted guesses, hint state, and status, so later data changes
  cannot alter a puzzle already played.

### Withdrawing a published Daily puzzle

Add an entry to `withdrawals.json` (catalog revision, puzzle key, date,
what was wrong, what the corrected source says). That date's Daily then shows
as **withdrawn** — not won, lost, or given up — with any guesses kept, the
originally intended answer explained as unverified, and Infinite offered. It
is never silently replaced; any replacement comes from a new schedule version.

## Reuse terms — review deferred

At the project owner's request, the licensing/source-permission review is
**deferred until after the Phase 5 release**. Nothing below is cleared; the
existing source records and notices are kept, and a credit line alone is not
assumed to settle any obligation.

- **Guild Wars Wiki** (wiki.guildwars.com). Contributor content is under the
  GNU Free Documentation License 1.3 or later; ArenaNet content on the wiki is
  not GFDL and stays ArenaNet's
  ([terms](https://wiki.guildwars.com/wiki/Guild_Wars_Wiki:Copyrights)).
  Buildle records skill lists as data with links to the exact page revisions.
  Open question: whether extracted factual lists need GFDL treatment beyond
  attribution and source links.
- **GuildWiki** (guildwars.fandom.com). Published under CC BY-NC-SA. Buildle
  uses it only to cross-check; no GuildWiki content is copied or displayed,
  only links to the pages checked (shown after a round ends).
- **Skill icons and skill text** are ArenaNet content. The site footer carries
  the ArenaNet/NCSOFT notice; ArenaNet's fan-content terms are unreviewed.
- **`build-wars/gw-skilldata`** (skill data): licence unreviewed.

In the game, a short credit line names both wikis, and each completed round
links to the two source pages it was built from.
