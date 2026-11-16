/// <reference types="node" />
// Validates the shipped Buildle data: catalog revision 1 and Daily schedule
// version 1. These files are immutable once released.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventOnlyReason } from '../../scripts/buildle/encounters.mjs';
import { buildSchedule, catalogPuzzleKeys } from '../../scripts/buildle/schedule.mjs';
import { locationEntries } from '../../scripts/buildle/wiki.mjs';
import catalogR1 from '../data/buildle/catalog-r1.json';
import scheduleData from '../data/buildle/schedule.json';
import withdrawalData from '../data/buildle/withdrawals.json';
import {
  buildleCatalogs,
  datasetProblems,
  latestCatalog,
  puzzleCatalog,
  skillFor,
} from './buildle';
import { resolvePuzzle } from './buildleDaily';
import { isInSkillPool } from './modes';

const dataDir = join(process.cwd(), 'src', 'data', 'buildle');
// Line endings are normalised so the hash is the same on every checkout
// (Git may convert them on Windows).
const sha256 = (file: string) =>
  createHash('sha256')
    .update(readFileSync(join(dataDir, file), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex');
const isElite = (id: number) => skillFor(id).elite;

describe('catalog revision 1', () => {
  it('is revision 1 and the latest catalog', () => {
    expect(catalogR1.revision).toBe(1);
    expect(buildleCatalogs[1]).toBe(catalogR1);
    expect(latestCatalog).toBe(catalogR1);
  });

  it('passes every runtime check: 3–8 skills, all in the pool, sourced with revisions', () => {
    expect(datasetProblems(catalogR1.bosses)).toEqual([]);
    for (const boss of catalogR1.bosses) {
      for (const variant of boss.variants) {
        expect(variant.skillIds.every(isInSkillPool)).toBe(true);
        expect(variant.sources.map((s) => s.site)).toEqual(['Guild Wars Wiki', 'GuildWiki']);
        expect(variant.sources.every((s) => s.revisionId)).toBe(true);
      }
    }
  });

  it('has the reviewed size (715 bosses / 715 variants)', () => {
    expect(catalogR1.bosses).toHaveLength(715);
    expect(catalogR1.bosses.flatMap((b) => b.variants)).toHaveLength(715);
  });

  it('leaves out documented event-only bosses, and keeps bosses absent only during events', () => {
    const names = new Set(catalogR1.bosses.map((b) => b.name));
    for (const name of ['Chae Plan', 'Pah Pei', 'Ursula the White']) {
      expect(names.has(name)).toBe(false);
    }
    expect(names.has('Nifling the Chained')).toBe(true); // "not during A Good Deed."
  });

  it('has no puzzle the runtime would find ambiguous (the pipeline checked the full corpus)', () => {
    for (const mode of ['hm', 'nm'] as const) {
      expect(puzzleCatalog(catalogR1.bosses, mode).ambiguous).toEqual([]);
    }
  });
});

describe('Daily schedule version 1', () => {
  const [v1] = scheduleData.versions;

  it('uses catalog revision 1 and the provisional 2026-11-16 start', () => {
    expect(scheduleData.versions).toHaveLength(1);
    expect(v1).toMatchObject({ version: 1, catalogRevision: 1, startsOn: '2026-11-16' });
  });

  it('is explicitly marked provisional and unreleased (launch date not confirmed)', () => {
    // Changes to "released" only in the approved final release configuration.
    expect(scheduleData.status).toBe('provisional-unreleased');
    expect(scheduleData.description).toMatch(/PROVISIONAL/);
  });

  it('lists every catalog puzzle exactly once per difficulty, and NM only elites', () => {
    for (const mode of ['hm', 'nm'] as const) {
      const keys = v1[mode];
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual(catalogPuzzleKeys(catalogR1, mode, isElite));
      expect(keys.length).toBe(puzzleCatalog(catalogR1.bosses, mode).puzzles.length);
      for (const key of keys) {
        const puzzle = resolvePuzzle(catalogR1, key);
        expect(puzzle).not.toBeNull();
        if (mode === 'nm') expect(isElite(puzzle!.targetId)).toBe(true);
      }
    }
    expect(v1.hm).toHaveLength(3169);
    expect(v1.nm).toHaveLength(441);
  });

  it('is exactly the fixed-seed shuffle of the catalog (reproducible)', () => {
    const regenerated = buildSchedule(catalogR1, { version: 1, startsOn: v1.startsOn, isElite });
    expect(regenerated).toEqual(v1);
  });
});

describe('published files are immutable', () => {
  // Update these hashes only before the first release (e.g. when the launch
  // date is confirmed). After release, changes need a new catalog revision
  // or schedule version instead.
  it('catalog r1 and schedule v1 match their recorded hashes', () => {
    expect(sha256('catalog-r1.json')).toBe(
      '68a406fa05a0d6cb0e4f286552484a78f47f54096f585abc5aaec967c29a0911',
    );
    expect(sha256('schedule.json')).toBe(
      '99f21298b16199bfc6c08468e75563651072049b59ed72eb3204542009ec47b9',
    );
  });

  it('withdrawals reference real published puzzles', () => {
    for (const entry of withdrawalData.withdrawals as { catalogRevision: number; puzzleKey: string }[]) {
      expect(resolvePuzzle(buildleCatalogs[entry.catalogRevision], entry.puzzleKey)).not.toBeNull();
    }
  });
});

describe('encounter rule (requirement B)', () => {
  const page = (locations: string) => `== Locations ==\n${locations}\n== Skills ==\n`;
  const linked = {
    'The Knights Who Say Nian': ['Canthan New Year quests'],
    'A Good Deed.': ['Eye of the North festival quests', 'Festival Event quests'],
    'The False Gods': ['Prophecies quests'],
  };

  it('excludes a boss whose page is in an event NPC category', () => {
    expect(eventOnlyReason(['Wintersday NPCs'], [], linked)).toMatch(/Wintersday NPCs/);
  });

  it('excludes a boss whose every location is during an event quest', () => {
    const locations = locationEntries(
      page('* [[Shing Jea Island]]\n** {{NPC location|Kinya Province}} (only during [[The Knights Who Say Nian]])'),
    );
    expect(eventOnlyReason([], locations, linked)).toMatch(/The Knights Who Say Nian/);
  });

  it('keeps a boss documented as NOT appearing during an event', () => {
    const locations = locationEntries(
      page('** {{NPC location|Varajar Fells}} (not during [[The Path to Revelations]] and [[A Good Deed.]])'),
    );
    expect(eventOnlyReason([], locations, linked)).toBeNull();
  });

  it('keeps a boss that also appears outside the event', () => {
    const locations = locationEntries(
      page(
        '** {{NPC location|Kinya Province}} (only during [[The Knights Who Say Nian]])\n** {{NPC location|Panjiang Peninsula}}',
      ),
    );
    expect(eventOnlyReason([], locations, linked)).toBeNull();
  });

  it('keeps ordinary quest bosses', () => {
    const locations = locationEntries(
      page('** {{NPC location|The Black Curtain}} (only during [[The False Gods]])'),
    );
    expect(eventOnlyReason([], locations, linked)).toBeNull();
  });
});
