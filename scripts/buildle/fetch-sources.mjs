// Step 1 of the Buildle boss-data pipeline: download the current wikitext of
// every boss page from the Guild Wars Wiki (via the per-profession boss
// categories) and the same titles from GuildWiki, for cross-checking.
//
//   node scripts/buildle/fetch-sources.mjs
//
// Writes scripts/buildle/cache/{official,guildwiki}.json (git-ignored), with
// each page's revision ID so the dataset can cite exactly what was read.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUILDWIKI, OFFICIAL, PROFESSIONS, sleep, wikiQuery } from './wiki.mjs';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), 'cache');
mkdirSync(cacheDir, { recursive: true });

async function bossTitles() {
  const titles = new Map();

  for (const profession of PROFESSIONS) {
    let next = {};

    do {
      const data = await wikiQuery(OFFICIAL, {
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${profession} bosses`,
        cmnamespace: '0',
        cmlimit: '500',
        ...next,
      });

      for (const member of data.query.categorymembers) {
        if (!member.title.startsWith('List of')) {
          titles.set(member.title, [...(titles.get(member.title) ?? []), profession]);
        }
      }

      next = data.continue ?? null;
      await sleep(500);
    } while (next);
  }

  return titles;
}

async function fetchPages(wiki, titles) {
  const pages = {};

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await wikiQuery(wiki, {
      action: 'query',
      prop: 'revisions',
      rvprop: 'content|ids',
      rvslots: 'main',
      redirects: '1',
      titles: batch.join('|'),
    });

    // Map normalised/redirected titles back to the title we asked for.
    const requested = new Map();
    for (const step of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) {
      requested.set(step.to, requested.get(step.from) ?? step.from);
    }

    for (const page of data.query.pages) {
      if (page.revisions) {
        const title = requested.get(page.title) ?? page.title;
        pages[title] = {
          pageTitle: page.title,
          revisionId: page.revisions[0].revid,
          text: page.revisions[0].slots.main.content,
        };
      }
    }

    process.stdout.write(`\r${wiki.site}: ${Math.min(i + 50, titles.length)}/${titles.length}`);
    await sleep(750);
  }

  process.stdout.write('\n');
  return pages;
}

const titles = await bossTitles();
const names = [...titles.keys()].sort();
const official = await fetchPages(OFFICIAL, names);

for (const [title, page] of Object.entries(official)) {
  page.professions = titles.get(title) ?? [];
}

const guildwiki = await fetchPages(GUILDWIKI, names);
const fetchedOn = new Date().toISOString().slice(0, 10);

writeFileSync(join(cacheDir, 'official.json'), JSON.stringify({ fetchedOn, pages: official }));
writeFileSync(join(cacheDir, 'guildwiki.json'), JSON.stringify({ fetchedOn, pages: guildwiki }));
console.log(`Saved ${Object.keys(official).length} official and ${Object.keys(guildwiki).length} GuildWiki pages (${fetchedOn}).`);
