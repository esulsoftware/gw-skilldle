// Step 1b of the Buildle boss-data pipeline (run after fetch-sources.mjs):
// fetch Guild Wars Wiki categories for
//   - every boss page (documented encounter type, e.g. "Wintersday NPCs"),
//   - every page linked from a boss's Locations section (quests, missions,
//     areas — e.g. a Canthan New Year quest), and
//   - every skill name on a boss list that is outside Skilldle's pool (audit
//     labels such as "Monster skills" or "Snow fighting skills").
//
//   node scripts/buildle/fetch-categories.mjs
//
// Writes scripts/buildle/cache/categories.json (git-ignored).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSkillPool, disallowedEntries, mapEntries } from './eligibility.mjs';
import { OFFICIAL, locationLinks, section, skillLists, sleep, wikiQuery } from './wiki.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pool = createSkillPool(read(join(here, '..', '..', 'src', 'data', 'skills.json')));
const official = read(join(here, 'cache', 'official.json')).pages;
const guildwiki = read(join(here, 'cache', 'guildwiki.json')).pages;

const skillNames = new Set();
for (const pages of [official, guildwiki]) {
  for (const page of Object.values(pages)) {
    const body = section(page.text, 'Skills[^=\\n]*');
    for (const list of body ? skillLists(body) : []) {
      for (const entry of disallowedEntries(mapEntries(list.entries, pool))) {
        skillNames.add(entry.name);
      }
    }
  }
}

const linked = new Set();
for (const page of Object.values(official)) {
  for (const title of locationLinks(page.text)) {
    linked.add(title);
  }
}

async function categoriesOf(titles) {
  const list = [...titles].sort();
  const result = {};

  for (let i = 0; i < list.length; i += 50) {
    const data = await wikiQuery(OFFICIAL, {
      action: 'query',
      prop: 'categories',
      cllimit: 'max',
      redirects: '1',
      titles: list.slice(i, i + 50).join('|'),
    });

    const requested = new Map();
    for (const step of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
      requested.set(step.to, requested.get(step.from) ?? step.from);
    }

    for (const page of data.query.pages) {
      const name = requested.get(page.title) ?? page.title;
      result[name] = (page.categories ?? []).map((c) => c.title.replace(/^Category:/, ''));
    }

    process.stdout.write(`\r${Math.min(i + 50, list.length)}/${list.length}`);
    await sleep(750);
  }

  process.stdout.write('\n');
  return result;
}

const categories = {
  bosses: await categoriesOf(Object.values(official).map((page) => page.pageTitle)),
  linked: await categoriesOf(linked),
  skills: await categoriesOf(skillNames),
};

writeFileSync(join(here, 'cache', 'categories.json'), JSON.stringify(categories, null, 1));
console.log(
  `Saved categories: ${Object.keys(categories.bosses).length} bosses, ` +
    `${Object.keys(categories.linked).length} linked pages, ${Object.keys(categories.skills).length} skills.`,
);
