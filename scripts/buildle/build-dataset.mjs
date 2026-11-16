// Step 2 of the Buildle boss-data pipeline: classify every boss skill list,
// cross-check it, find ambiguous puzzles across the whole supported corpus,
// apply the v1 release criteria, and write the dataset, schedule, and reports.
//
//   node scripts/buildle/build-dataset.mjs             # reports + candidates only
//   node scripts/buildle/build-dataset.mjs --release   # also write catalog r1 + schedule v1
//       [--start-date YYYY-MM-DD] [--release-status provisional-unreleased|released] [--replace-unreleased]
//
// Reads  scripts/buildle/cache/*.json (from fetch-sources.mjs, fetch-categories.mjs)
// Writes scripts/buildle/output/buildle-candidates.json (git-ignored),
//        docs/buildle-data-report.md, docs/buildle-variants.csv,
//        docs/buildle-disallowed-skills.csv, and with --release,
//        src/data/buildle/catalog-r1.json and src/data/buildle/schedule.json.
//
// Published files are immutable: --release refuses to change an existing
// catalog revision or schedule version unless --replace-unreleased is given,
// which is only allowed before that version has ever shipped.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GUILDWIKI,
  OFFICIAL,
  encounter,
  isMarkedIncomplete,
  linkedNames,
  pageUrl,
  section,
  skillLists,
} from './wiki.mjs';
import { barInPool, createSkillPool, disallowedEntries, mapEntries as mapToPool } from './eligibility.mjs';
import { eventOnlyReason } from './encounters.mjs';
import { buildSchedule } from './schedule.mjs';
import { locationEntries } from './wiki.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const official = read(join(here, 'cache', 'official.json'));
const guildwiki = read(join(here, 'cache', 'guildwiki.json'));
// Wiki categories (fetch-categories.mjs): boss pages and linked quest pages
// decide the encounter rule; skill categories label the audit.
const categories = read(join(here, 'cache', 'categories.json'));
const skillCategories = categories.skills;

// Skilldle's normal skill pool (see eligibility.mjs).
const pool = createSkillPool(read(join(root, 'src', 'data', 'skills.json')));
const skillByName = pool.byName;
const skillById = pool.byId;

export const MIN_SKILLS = 3;
export const MAX_SKILLS = 8;

// Mutually exclusive outcomes, in precedence order: a variant's outcome is
// the first that applies. Every applicable flag is still recorded.
const OUTCOMES = [
  ['no-skill-list', 'No skill list on the Guild Wars Wiki page'],
  ['unsupported-skills', "A skill outside Skilldle's normal pool (monster/boss-only, event, special, or unknown)"],
  ['event-only-encounter', 'Event/festival-only encounter (documented on the wiki)'],
  ['alternative-encounters', 'Several or labelled lists: alternative/conditional encounters (deferred)'],
  ['conditional-skill-notes', 'Per-skill conditional notes (e.g. "level 24 only")'],
  ['repeated-skill', 'A skill listed twice'],
  ['page-incomplete', 'Page marked stub/incomplete/verify'],
  ['notes-mention-skills', 'Notes mention other skills (possible conditional use)'],
  ['too-few-skills', `Fewer than ${MIN_SKILLS} skills`],
  ['too-many-skills', `More than ${MAX_SKILLS} skills`],
  ['not-cross-checked', 'No GuildWiki skill list to cross-check against'],
  ['sources-conflict', 'GuildWiki lists different skills (unresolved conflict)'],
  ['all-puzzles-ambiguous', 'Every puzzle is ambiguous with another documented list'],
  ['eligible', 'Eligible'],
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES);

const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const setKey = (ids) => [...ids].sort((a, b) => a - b).join(',');

const mapEntries = (entries) => mapToPool(entries, pool);

// ---------------------------------------------------------------------------
// 1. Every official list becomes a variant with flags.

const variants = [];
const bossNames = Object.keys(official.pages).sort();

for (const title of bossNames) {
  const page = official.pages[title];
  const body = section(page.text, 'Skills');
  const lists = body ? skillLists(body).filter((list) => list.entries.length > 0) : [];
  const notesBody = section(page.text, 'Notes?') ?? '';
  const bossId = slug(title);
  // Requirement B: documented event/festival-only encounters are excluded.
  const eventReason = eventOnlyReason(
    categories.bosses[page.pageTitle] ?? [],
    locationEntries(page.text),
    categories.linked,
  );

  const guildPage = guildwiki.pages[title];
  const guildBody = guildPage ? section(guildPage.text, 'Skills[^=\\n]*') : null;
  const guildLists = guildBody
    ? skillLists(guildBody).filter((list) => list.entries.length > 0).map((list) => mapEntries(list.entries))
    : [];

  if (lists.length === 0) {
    variants.push({ title, bossId, id: bossId, index: 0, entries: [], flags: ['no-skill-list'], eventReason, page, guildLists, guildPage });
    continue;
  }

  lists.forEach((list, index) => {
    const entries = mapEntries(list.entries);
    const ids = entries.map((e) => e.id);
    const flags = [];

    // The whole documented bar must be in the pool; nothing is dropped.
    if (!barInPool(entries)) flags.push('unsupported-skills');
    if (eventReason) flags.push('event-only-encounter');
    if (lists.length > 1 || list.context.length > 0) flags.push('alternative-encounters');
    if (list.notes.length > 0) flags.push('conditional-skill-notes');
    if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) flags.push('repeated-skill');
    if (isMarkedIncomplete(page.text)) flags.push('page-incomplete');

    const own = new Set(entries.map((e) => e.name.toLowerCase()));
    const mentioned = [...linkedNames(notesBody)].filter(
      (name) => skillByName.has(name.toLowerCase()) && !own.has(name.toLowerCase()),
    );
    if (mentioned.length > 0) flags.push('notes-mention-skills');

    if (entries.length < MIN_SKILLS) flags.push('too-few-skills');
    if (entries.length > MAX_SKILLS) flags.push('too-many-skills');

    const officialSet = setKey(ids.filter(Boolean));
    if (guildLists.length === 0) {
      flags.push('not-cross-checked');
    } else if (
      guildLists.length !== 1 ||
      guildLists[0].some((e) => e.id === null) ||
      setKey(guildLists[0].map((e) => e.id)) !== officialSet ||
      guildLists[0].length !== entries.length
    ) {
      flags.push('sources-conflict');
    }

    variants.push({
      title,
      bossId,
      id: lists.length > 1 ? `${bossId}--${index + 1}` : bossId,
      index,
      context: list.context,
      notes: list.notes,
      mentioned,
      eventReason,
      entries,
      flags,
      page,
      guildLists,
      guildPage,
    });
  });
}

// ---------------------------------------------------------------------------
// 2. Ambiguity across the complete supported corpus: every documented list
// whose skills all map to player skills, of any size and whatever its other
// flags, plus GuildWiki lists that differ from the official ones.

const corpus = [];

for (const v of variants) {
  if (v.entries.length > 0 && v.entries.every((e) => e.id !== null)) {
    corpus.push({ label: `${v.title} (Guild Wars Wiki list ${v.index + 1})`, ids: v.entries.map((e) => e.id) });
  }
}

for (const title of bossNames) {
  const officialSets = new Set(
    variants.filter((v) => v.title === title && v.entries.length).map((v) => setKey(v.entries.map((e) => e.id).filter(Boolean))),
  );
  const v = variants.find((x) => x.title === title);

  (v?.guildLists ?? []).forEach((list, index) => {
    if (list.every((e) => e.id !== null) && !officialSets.has(setKey(list.map((e) => e.id)))) {
      corpus.push({ label: `${title} (GuildWiki list ${index + 1})`, ids: list.map((e) => e.id) });
    }
  });
}

// The rendered clue is the set of visible skills and the bar size (the
// missing slot and unused slots follow the visible skills, which are shown
// in a fixed name order), so source ordering plays no part.
const clue = (ids, target) => `${ids.length}|${setKey(ids.filter((id) => id !== target))}`;
const targetsFor = (ids, mode) => (mode === 'nm' ? ids.filter((id) => skillById.get(id).elite) : ids);

const answersByClue = { hm: new Map(), nm: new Map() };
for (const mode of ['hm', 'nm']) {
  for (const doc of corpus) {
    for (const target of targetsFor(doc.ids, mode)) {
      const key = clue(doc.ids, target);
      const entry = answersByClue[mode].get(key) ?? new Map();
      entry.set(target, [...(entry.get(target) ?? []), doc.label]);
      answersByClue[mode].set(key, entry);
    }
  }
}

function ambiguity(ids, target, mode) {
  const answers = answersByClue[mode].get(clue(ids, target));
  if (!answers || answers.size < 2) return null;
  return [...answers].filter(([id]) => id !== target).flatMap(([, labels]) => labels);
}

// ---------------------------------------------------------------------------
// 3. Release criteria, outcomes, and puzzles.

for (const v of variants) {
  const ids = v.entries.map((e) => e.id);
  const preliminary = OUTCOMES.find(([key]) => v.flags.includes(key));

  if (preliminary) {
    v.outcome = preliminary[0];
    continue;
  }

  v.puzzles = { hm: [], nm: [] };
  v.excludedTargets = [];

  for (const mode of ['hm', 'nm']) {
    for (const target of targetsFor(ids, mode)) {
      const others = ambiguity(ids, target, mode);
      if (others) {
        v.excludedTargets.push({ skillId: target, mode, reason: 'ambiguous', with: others });
      } else {
        v.puzzles[mode].push(target);
      }
    }
  }

  if (v.excludedTargets.length > 0) v.flags.push('has-ambiguous-targets');
  v.outcome = v.puzzles.hm.length > 0 ? 'eligible' : 'all-puzzles-ambiguous';
}

const eligible = variants.filter((v) => v.outcome === 'eligible');

// ---------------------------------------------------------------------------
// 4. Dataset output.

const fetchedOn = official.fetchedOn;

function datasetVariant(v) {
  const place = encounter(v.page.text);
  return {
    id: v.id,
    skillIds: v.entries.map((e) => e.id),
    encounter: {
      campaign: place.campaign ?? 'Unknown',
      locations: place.locations,
      details: place.details,
    },
    sources: [
      { site: OFFICIAL.site, url: pageUrl(OFFICIAL, v.page.pageTitle), revisionId: v.page.revisionId },
      { site: GUILDWIKI.site, url: pageUrl(GUILDWIKI, v.guildPage.pageTitle), revisionId: v.guildPage.revisionId },
    ],
    checkedOn: fetchedOn,
    excludedTargets: v.excludedTargets.map(({ skillId, mode, reason }) => ({ skillId, mode, reason })),
    notes: [],
  };
}

function dataset(list, revision) {
  const bosses = new Map();
  for (const v of list) {
    const boss = bosses.get(v.bossId) ?? { id: v.bossId, name: v.title, variants: [] };
    boss.variants.push(datasetVariant(v));
    bosses.set(v.bossId, boss);
  }

  return {
    schemaVersion: 3,
    revision,
    description: `Buildle boss catalog revision ${revision}, generated by scripts/buildle/build-dataset.mjs. Immutable once shipped; corrections go in a new revision.`,
    sourcesFetchedOn: fetchedOn,
    criteria: [
      `${MIN_SKILLS}–${MAX_SKILLS} distinct skills, every one in Skilldle's normal skill pool`,
      'Not a documented event/festival-only encounter',
      'One documented list on the Guild Wars Wiki, with no conditional notes, labels, or incomplete markers',
      'GuildWiki lists exactly the same skills (cross-checked, not proof of in-game accuracy)',
      'Targets whose visible clue matches another documented list with a different answer are excluded',
    ],
    attribution:
      'Boss skill lists from the Guild Wars Wiki (wiki.guildwars.com, GNU FDL 1.3 or later), cross-checked against GuildWiki (guildwars.fandom.com).',
    bosses: [...bosses.values()],
  };
}

const outputDir = join(here, 'output');
mkdirSync(outputDir, { recursive: true });
const catalog = dataset(eligible, 1);
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
writeFileSync(join(outputDir, 'buildle-candidates.json'), catalogText);

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

/** Writes a published data file, refusing to change it unless allowed. */
function writeImmutable(path, text) {
  let existing = null;
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    // New file.
  }

  if (existing !== null && existing !== text && !process.argv.includes('--replace-unreleased')) {
    throw new Error(
      `${path} already exists with different content. Published Buildle data is immutable: ` +
        'create a new revision/version, or pass --replace-unreleased if this one has never shipped.',
    );
  }

  writeFileSync(path, text);
}

if (process.argv.includes('--release')) {
  const dataDir = join(root, 'src', 'data', 'buildle');
  mkdirSync(dataDir, { recursive: true });
  writeImmutable(join(dataDir, 'catalog-r1.json'), catalogText);

  const startsOn = argValue('--start-date') ?? '2026-11-16';
  // Until the production launch date is confirmed, the schedule is a
  // provisional preview schedule: --release-status released marks it shipped.
  const status = argValue('--release-status') ?? 'provisional-unreleased';
  const schedule = {
    schemaVersion: 1,
    status,
    description:
      "Buildle Daily schedules. A version's start date, order, and catalog revision never change once shipped; add a new version instead." +
      (status === 'released'
        ? ''
        : ' PROVISIONAL: preview schedule only; the production launch date is not confirmed and this file may still change before release.'),
    versions: [buildSchedule(catalog, { version: 1, startsOn, isElite: (id) => skillById.get(id).elite })],
  };
  writeImmutable(join(dataDir, 'schedule.json'), `${JSON.stringify(schedule, null, 1)}\n`);
  console.log(`Wrote catalog r1 and schedule v1 (starts ${startsOn}).`);
}

// ---------------------------------------------------------------------------
// 5. Reports.

const count = (items, key) => items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map());
const bossesOf = (list) => new Set(list.map((v) => v.title));

const bossOutcome = new Map();
for (const v of variants) {
  const current = bossOutcome.get(v.title);
  const rank = (o) => OUTCOMES.findIndex(([key]) => key === o);
  // A boss counts as eligible if any variant is; otherwise its earliest reason.
  if (!current || (v.outcome === 'eligible') || (current !== 'eligible' && rank(v.outcome) < rank(current))) {
    bossOutcome.set(v.title, v.outcome);
  }
}

const hmPuzzles = eligible.reduce((n, v) => n + v.puzzles.hm.length, 0);
const nmPuzzles = eligible.reduce((n, v) => n + v.puzzles.nm.length, 0);
const ambiguousTargets = eligible.flatMap((v) => v.excludedTargets);
// Every disallowed skill in every documented list, for the audit.
const disallowed = variants.flatMap((v) =>
  disallowedEntries(v.entries).map((e) => ({ variant: v, entry: e })),
);
const disallowedByName = new Map();
for (const { variant, entry } of disallowed) {
  const row = disallowedByName.get(entry.name) ?? { entry, lists: 0, bosses: new Set() };
  row.lists += 1;
  row.bosses.add(variant.title);
  disallowedByName.set(entry.name, row);
}
const categoryHint = (name) =>
  (skillCategories[name] ?? [])
    // Categories that say what kind of skill it is (monster, festival/event,
    // special replacement bar, ...); generic ones like "Spells" are omitted.
    .filter((c) =>
      /monster|boss|snow fighting|wintersday|halloween|festival|event|celestial|junundu|devourer|siege|common skills|polymock|dragon arena|rollerbeetle|transform|environment|bundle|tonic|sweet|alcohol|holiday|pvp/i.test(c),
    )
    .join(', ');

const lines = [];
const table = (head, rows) => {
  lines.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  lines.push('');
};

lines.push(
  '# Buildle boss data report',
  '',
  `Generated by \`scripts/buildle/build-dataset.mjs\` from wiki pages fetched on ${fetchedOn}.`,
  'Matching wiki lists are **cross-checked**, not proof of in-game accuracy.',
  '',
  '## Totals',
  '',
);
table(['Measure', 'Count'], [
  ['Boss pages (unique bosses)', bossNames.length],
  ['Documented skill lists (variants)', variants.filter((v) => v.entries.length).length],
  ['Supported lists in the ambiguity corpus (incl. GuildWiki-only lists)', corpus.length],
  ['**Eligible bosses**', bossesOf(eligible).size],
  ['**Eligible variants**', eligible.length],
  ['Eligible variants with an NM target', eligible.filter((v) => v.puzzles.nm.length).length],
  ['**HM puzzles** (after all exclusions)', hmPuzzles],
  ['**NM puzzles** (after all exclusions)', nmPuzzles],
  ['Targets excluded as ambiguous (HM / NM)', `${ambiguousTargets.filter((t) => t.mode === 'hm').length} / ${ambiguousTargets.filter((t) => t.mode === 'nm').length}`],
  ['Eligible variants with 2+ elites', eligible.filter((v) => v.entries.filter((e) => skillById.get(e.id).elite).length > 1).length],
]);

lines.push('## Eligible variants by skill count', '');
table(['Skills', 'Variants'], [...count(eligible, (v) => v.entries.length)].sort((a, b) => a[0] - b[0]));

lines.push('## Outcomes (mutually exclusive)', '', 'Each variant has exactly one outcome: the first that applies, in this order. Bosses are eligible if any variant is.', '');
const variantOutcomes = count(variants, (v) => v.outcome);
const bossOutcomes = count([...bossOutcome.values()], (o) => o);
table(['Outcome', 'Variants', 'Bosses'], OUTCOMES.map(([key, label]) => [label, variantOutcomes.get(key) ?? 0, bossOutcomes.get(key) ?? 0]));

lines.push('## Warning flags (overlapping)', '', 'A variant can carry several flags, so these do not add up to the total.', '');
const flagCounts = count(variants.flatMap((v) => v.flags), (f) => f);
table(['Flag', 'Variants'], [...flagCounts].sort((a, b) => b[1] - a[1]).map(([key, n]) => [OUTCOME_LABEL[key] ?? 'Has ambiguous targets (excluded per target)', n]));

lines.push(
  "## Skills outside Skilldle's normal pool",
  '',
  "Buildle uses only Skilldle's normal skill pool (every skill Skilldle HM accepts). A documented list with any of",
  'these skills is excluded entirely, for NM and HM; the skill is never dropped from the bar. Per-list detail:',
  '[`buildle-disallowed-skills.csv`](buildle-disallowed-skills.csv).',
  '',
  `${disallowed.length} disallowed entries in ${new Set(disallowed.map((d) => d.variant)).size} lists (${new Set(disallowed.map((d) => d.variant.title)).size} bosses).`,
  '',
);
table(
  ['Skill name', 'Why it is disallowed', 'Pool skill with the same name', 'Wiki categories', 'Lists', 'Bosses'],
  [...disallowedByName]
    .sort((a, b) => b[1].lists - a[1].lists || a[0].localeCompare(b[0]))
    .map(([name, row]) => [
      name.replace(/\|/g, '\\|'),
      row.entry.disallowed,
      row.entry.sharesNameWith ? `${skillById.get(row.entry.sharesNameWith).name} (${row.entry.sharesNameWith})` : '—',
      categoryHint(name) || '—',
      row.lists,
      row.bosses.size,
    ]),
);

lines.push(
  '## Event/festival-only encounters',
  '',
  'Excluded when the wiki documents the boss as event-only: an event NPC category on its page, or every',
  'documented location tied to an event quest/page. Bosses that also appear outside events are kept.',
  '',
);
const eventBosses = [...new Map(variants.filter((v) => v.eventReason).map((v) => [v.title, v])).values()];
table(['Boss', 'Documented reason', 'Otherwise'], eventBosses.length
  ? eventBosses.map((v) => {
      const other = OUTCOMES.find(([key]) => key !== 'event-only-encounter' && v.flags.includes(key));
      return [v.title, v.eventReason, other ? OUTCOME_LABEL[other[0]] : 'Would be eligible'];
    })
  : [['—', '—', '—']]);

lines.push('## Ambiguous targets excluded from eligible variants', '');
table(['Boss', 'Mode', 'Hidden skill', 'Same clue as'], ambiguousTargets.length
  ? eligible.flatMap((v) => v.excludedTargets.map((t) => [v.title, t.mode.toUpperCase(), skillById.get(t.skillId).name, t.with.join('; ')]))
  : [['—', '—', '—', '—']]);

lines.push('Per-variant detail: [`buildle-variants.csv`](buildle-variants.csv).', '');
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'buildle-data-report.md'), lines.join('\n'));

const toCsv = (rows) =>
  `${rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')}\n`;

const csv = [['Boss', 'Variant', 'Skills', 'Elites', 'Outcome', 'Flags', 'Disallowed skills', 'Event-only reason', 'Source', 'Revision']];
for (const v of variants) {
  csv.push([
    v.title, v.id, v.entries.length,
    v.entries.filter((e) => e.id && skillById.get(e.id).elite).length,
    OUTCOME_LABEL[v.outcome], v.flags.join(' '),
    disallowedEntries(v.entries).map((e) => e.name).join('; '),
    v.eventReason ?? '',
    pageUrl(OFFICIAL, v.page.pageTitle), v.page.revisionId,
  ]);
}
writeFileSync(join(root, 'docs', 'buildle-variants.csv'), toCsv(csv));

const disallowedCsv = [['Boss', 'Variant', 'Disallowed skill', 'Reason', 'Pool skill with the same name (ID)', 'Wiki categories', 'Other skills on the list', 'Source', 'Revision']];
for (const { variant, entry } of disallowed) {
  disallowedCsv.push([
    variant.title, variant.id, entry.name, entry.disallowed,
    entry.sharesNameWith ? `${skillById.get(entry.sharesNameWith).name} (${entry.sharesNameWith})` : '',
    (skillCategories[entry.name] ?? []).join('; '),
    variant.entries.filter((e) => e !== entry).map((e) => (e.id ? `${e.name} (${e.id})` : e.name)).join('; '),
    pageUrl(OFFICIAL, variant.page.pageTitle), variant.page.revisionId,
  ]);
}
writeFileSync(join(root, 'docs', 'buildle-disallowed-skills.csv'), toCsv(disallowedCsv));

console.log(`Eligible: ${bossesOf(eligible).size} bosses, ${eligible.length} variants; HM ${hmPuzzles} / NM ${nmPuzzles} puzzles.`);
