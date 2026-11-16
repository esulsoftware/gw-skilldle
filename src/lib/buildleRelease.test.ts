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
import { loadDaily, resolvePuzzle } from './buildleDaily';
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

  it('uses catalog revision 1 and the 2026-11-16 (UTC) launch date', () => {
    expect(scheduleData.versions).toHaveLength(1);
    expect(v1).toMatchObject({ version: 1, catalogRevision: 1, startsOn: '2026-11-16' });
  });

  it('is marked released, with no provisional wording left', () => {
    expect(scheduleData.status).toBe('released');
    expect(scheduleData.description).not.toMatch(/PROVISIONAL/i);
  });

  it('a Daily saved during the preview loads unchanged under the released schedule', () => {
    // Preview saves stored the full puzzle with catalog revision 1 and
    // schedule version 1; releasing changed neither, so they still load.
    const date = new Date('2026-11-16T12:00:00Z');
    const fresh = loadDaily('hm', date, { storage: null });
    if (fresh.kind !== 'puzzle') throw new Error('expected a Daily puzzle');

    const guessId = isElite(fresh.puzzle.targetId) ? 109 : 132; // any wrong pool skill
    const previewSave = JSON.stringify({
      version: 1,
      date: '2026-11-16',
      difficulty: 'hm',
      puzzle: fresh.puzzle,
      guessIds: fresh.puzzle.variant.skillIds.includes(guessId) ? [] : [guessId],
      hintRevealed: true,
      status: 'playing',
    });
    const restored = loadDaily('hm', date, { storage: { getItem: () => previewSave } });

    expect(restored).toMatchObject({
      kind: 'puzzle',
      status: 'playing',
      hintRevealed: true,
      puzzle: { key: fresh.puzzle.key, catalogRevision: 1, scheduleVersion: 1 },
    });
    expect(restored.kind === 'puzzle' && restored.puzzle.variant).toEqual(fresh.puzzle.variant);
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
  // Released on 2026-11-16: these files must never change again. Any
  // correction needs a new catalog revision or schedule version.
  it('catalog r1 and schedule v1 match their recorded hashes', () => {
    expect(sha256('catalog-r1.json')).toBe(
      '68a406fa05a0d6cb0e4f286552484a78f47f54096f585abc5aaec967c29a0911',
    );
    expect(sha256('schedule.json')).toBe(
      '75edcc0dd08bc10c987a3f941b3af2bd090967ff8d221580eb73740979f69fab',
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
