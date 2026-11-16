/// <reference types="node" />
// Reads the icon files from disk, so it needs Node's types (already installed).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { skills } from './skills';

const iconDirectory = join(process.cwd(), 'public', 'skill-icons');

const readIcon = (id: number) => readFileSync(join(iconDirectory, `${id}.png`));

describe('skill icons', () => {
  it('gives every skill its own artwork (no icon copied from a related skill)', () => {
    const idsByHash = new Map<string, number[]>();

    for (const skill of skills) {
      const path = join(iconDirectory, `${skill.id}.png`);

      if (!existsSync(path)) {
        continue;
      }

      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      idsByHash.set(hash, [...(idsByHash.get(hash) ?? []), skill.id]);
    }

    const duplicates = [...idsByHash.values()].filter((ids) => ids.length > 1);

    expect(duplicates).toEqual([]);
  });

  // The wiki lists a page's images alphabetically, so a substring match once
  // picked the related skill's file first ("Arcane Echo" before "Echo").
  const relatedPairs = [
    { name: 'Echo', id: 74, relatedName: 'Arcane Echo', relatedId: 75 },
    { name: 'Riposte', id: 387, relatedName: 'Deadly Riposte', relatedId: 388 },
  ];

  for (const { name, id, relatedName, relatedId } of relatedPairs) {
    it(`${name} does not use ${relatedName}'s icon`, () => {
      expect(skills.find((skill) => skill.id === id)?.name).toBe(name);
      expect(skills.find((skill) => skill.id === relatedId)?.name).toBe(relatedName);
      expect(readIcon(id).equals(readIcon(relatedId))).toBe(false);
    });
  }
});
