import { describe, expect, it } from 'vitest';
import {
  ALL,
  attributeOptions,
  compareForSort,
  matchesAttribute,
  matchesType,
  skillStatLine,
  sortFields,
  sortSkills,
  tabPool,
  typeOptions,
  type SortKey,
} from './libraryFilters';
import {
  allegianceAttributeName,
  isRankBasedPveSkill,
  professionName,
  skills,
  typeName,
  type Skill,
} from './skills';

const labels = (options: { label: string }[]) =>
  options.map((option) => option.label.replace(/ \(\d+\)$/, ''));

function fake(name: string, overrides: Partial<Skill> = {}): Skill {
  return { ...skills[0], id: Math.random(), name, ...overrides };
}

describe('tabPool (membership unchanged)', () => {
  it('profession tabs include their allegiance skills; PvE has every rank skill', () => {
    const warrior = tabPool(skills, 'Warrior', false);
    expect(warrior).toHaveLength(
      skills.filter((s) => professionName(s) === 'Warrior').length,
    );
    expect(warrior.filter(isRankBasedPveSkill)).toHaveLength(3);
    expect(tabPool(skills, 'PvE', false)).toHaveLength(
      skills.filter(isRankBasedPveSkill).length,
    );
  });

  it('limits to elites when NM hides non-elites', () => {
    const pool = tabPool(skills, 'Elementalist', true);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((skill) => skill.elite)).toBe(true);
  });
});

describe('attributeOptions', () => {
  it('lists profession attributes A–Z, then allegiances, then No attribute', () => {
    expect(labels(attributeOptions(tabPool(skills, 'Elementalist', false)))).toEqual([
      'Air Magic',
      'Earth Magic',
      'Energy Storage',
      'Fire Magic',
      'Water Magic',
      'Kurzick',
      'Luxon',
      'Sunspear',
      'No attribute',
    ]);
  });

  it('shows real counts', () => {
    const pool = tabPool(skills, 'Elementalist', false);
    const fire = attributeOptions(pool).find((o) => o.value === 'Fire Magic')!;
    expect(fire.count).toBe(pool.filter((s) => matchesAttribute(s, 'Fire Magic')).length);
    expect(fire.label).toBe(`Fire Magic (${fire.count})`);
  });

  it('PvE lists the allegiance groups from the data', () => {
    expect(labels(attributeOptions(tabPool(skills, 'PvE', false)))).toEqual([
      'Asura',
      'Deldrimor',
      'Ebon Vanguard',
      'Kurzick',
      'Lightbringer',
      'Luxon',
      'Norn',
      'Sunspear',
    ]);
  });

  it('only offers attributes present in the NM elite-only pool', () => {
    const elitePool = tabPool(skills, 'Warrior', true);
    for (const option of attributeOptions(elitePool)) {
      expect(elitePool.some((s) => matchesAttribute(s, option.value))).toBe(true);
    }
  });

  it('matches only the selected attribute', () => {
    const pool = tabPool(skills, 'Elementalist', false);
    const fire = pool.filter((s) => matchesAttribute(s, 'Fire Magic'));
    expect(fire.length).toBeGreaterThan(0);
    expect(fire.every((s) => allegianceAttributeName(s) === 'Fire Magic')).toBe(true);
    expect(pool.filter((s) => matchesAttribute(s, ALL))).toHaveLength(pool.length);
  });
});

describe('typeOptions', () => {
  it('separates "Any spell" from the exact "Spell" type', () => {
    const sections = typeOptions(tabPool(skills, 'Monk', false));
    const spells = sections.find((section) => section.label === 'Spells')!;

    expect(spells.options[0].value).toBe('family:spell');
    expect(spells.options[0].label).toMatch(/^Any spell \(\d+\)$/);
    expect(spells.options.map((o) => o.value)).toContain('type:Spell');
    expect(labels(spells.options)).toEqual([
      'Any spell',
      'Enchantment Spell',
      'Hex Spell',
      'Spell',
    ]);
  });

  it('puts types without a family in "Other types" and omits "Any" for one-type families', () => {
    const sections = typeOptions(tabPool(skills, 'Monk', false));
    expect(sections.map((s) => s.label)).toEqual(['Spells', 'Melee attacks', 'Other types']);
    expect(labels(sections[1].options)).toEqual(['Melee Attack']);
    expect(labels(sections[2].options)).toEqual(['Signet', 'Skill']);
  });

  it('merges type codes that share a label', () => {
    const options = typeOptions(skills).flatMap((section) => section.options);
    const exact = options.filter((o) => o.value.startsWith('type:'));
    expect(new Set(exact.map((o) => o.value)).size).toBe(exact.length);

    const spell = exact.find((o) => o.value === 'type:Spell')!;
    expect(spell.count).toBe(skills.filter((s) => typeName(s) === 'Spell').length);
  });

  it('family and exact filters match the existing comparison families', () => {
    const hex = skills.find((s) => typeName(s) === 'Hex Spell')!;
    expect(matchesType(hex, 'family:spell')).toBe(true);
    expect(matchesType(hex, 'type:Spell')).toBe(false);
    expect(matchesType(hex, 'type:Hex Spell')).toBe(true);

    const winds = skills.find((s) => s.name === 'Winds')!;
    expect(matchesType(winds, 'family:ritual')).toBe(true);
    expect(labels(typeOptions(tabPool(skills, 'PvE', false)).find((s) => s.label === 'Rituals')!.options))
      .toEqual(['Any ritual', 'Binding Ritual', 'Ebon Vanguard Ritual']);
  });
});

describe('sorting', () => {
  const names = (list: Skill[]) => list.map((s) => s.name);

  it('Energy treats zero-cost (null) as 0', () => {
    const pool = [fake('B', { energy: 10 }), fake('A', { energy: null }), fake('C', { energy: 5 })];
    expect(names(sortSkills(pool, 'energy', 'asc'))).toEqual(['A', 'C', 'B']);
    expect(names(sortSkills(pool, 'energy', 'desc'))).toEqual(['B', 'C', 'A']);
  });

  it('puts missing Cast/Recharge values last in both directions', () => {
    for (const [key, field] of [['cast', 'activation'], ['recharge', 'recharge']] as const) {
      const pool = [
        fake('Missing', { [field]: null }),
        fake('Zero', { [field]: 0 }),
        fake('Two', { [field]: 2 }),
      ];
      expect(names(sortSkills(pool, key, 'asc'))).toEqual(['Zero', 'Two', 'Missing']);
      expect(names(sortSkills(pool, key, 'desc'))).toEqual(['Two', 'Zero', 'Missing']);
    }
  });

  it('breaks ties by name A–Z, whatever the direction', () => {
    const pool = [fake('Beta', { recharge: 5 }), fake('Alpha', { recharge: 5 })];
    expect(names(sortSkills(pool, 'recharge', 'asc'))).toEqual(['Alpha', 'Beta']);
    expect(names(sortSkills(pool, 'recharge', 'desc'))).toEqual(['Alpha', 'Beta']);
  });

  it('Campaign runs Core → Eye of the North, and reverses', () => {
    const pool = [fake('N', { campaign: 3 }), fake('C', { campaign: 0 }), fake('P', { campaign: 1 })];
    expect(names(sortSkills(pool, 'campaign', 'asc'))).toEqual(['C', 'P', 'N']);
    expect(names(sortSkills(pool, 'campaign', 'desc'))).toEqual(['N', 'P', 'C']);
  });

  it('Elite first / non-elite first', () => {
    const pool = [fake('Plain', { elite: false }), fake('Gold', { elite: true })];
    expect(names(sortSkills(pool, 'elite', 'asc'))).toEqual(['Gold', 'Plain']);
    expect(names(sortSkills(pool, 'elite', 'desc'))).toEqual(['Plain', 'Gold']);
  });

  it('Type sorts by displayed label', () => {
    const pool = tabPool(skills, 'Monk', false);
    const sorted = sortSkills(pool, 'type', 'asc').map(typeName);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b)));
    expect(sortSkills(pool, 'type', 'desc').map(typeName)[0]).toBe('Spell');
  });

  it('Attribute groups: attributes, then allegiances, then No attribute last both ways', () => {
    const pool = tabPool(skills, 'Elementalist', false);
    const order = (direction: 'asc' | 'desc') => [
      ...new Set(sortSkills(pool, 'attribute', direction).map(allegianceAttributeName)),
    ];

    expect(order('asc')).toEqual([
      'Air Magic', 'Earth Magic', 'Energy Storage', 'Fire Magic', 'Water Magic',
      'Allegiance - Kurzick', 'Allegiance - Luxon', 'Allegiance - Sunspear',
      'None',
    ]);
    expect(order('desc')).toEqual([
      'Water Magic', 'Fire Magic', 'Energy Storage', 'Earth Magic', 'Air Magic',
      'Allegiance - Sunspear', 'Allegiance - Luxon', 'Allegiance - Kurzick',
      'None',
    ]);
  });

  it('Name sorts A–Z and Z–A', () => {
    const pool = [fake('Bravo'), fake('alpha'), fake('Charlie')];
    expect(names(sortSkills(pool, 'name', 'asc'))).toEqual(['alpha', 'Bravo', 'Charlie']);
    expect(names(sortSkills(pool, 'name', 'desc'))).toEqual(['Charlie', 'Bravo', 'alpha']);
  });

  it('every field is a consistent comparator on real data', () => {
    const keys: SortKey[] = ['name', 'energy', 'cast', 'recharge', 'attribute', 'type', 'campaign', 'elite'];
    const sample = skills.slice(0, 200);
    for (const key of keys) {
      for (const direction of ['asc', 'desc'] as const) {
        const sorted = sortSkills(sample, key, direction);
        for (let i = 1; i < sorted.length; i += 1) {
          expect(compareForSort(sorted[i - 1], sorted[i], key, direction)).toBeLessThanOrEqual(0);
        }
      }
    }
  });
});

describe('sortFields', () => {
  it('offers the eight fields, without Elite in elite-only NM', () => {
    expect(sortFields('Warrior', false).map((f) => f.key)).toEqual([
      'name', 'energy', 'cast', 'recharge', 'attribute', 'type', 'campaign', 'elite',
    ]);
    expect(sortFields('Warrior', true).map((f) => f.key)).not.toContain('elite');
    expect(sortFields('PvE', false).find((f) => f.key === 'attribute')!.label).toBe(
      'Allegiance / rank',
    );
  });
});

describe('skillStatLine', () => {
  it('shows attribute, type, energy, cast, recharge, and campaign', () => {
    const fireball = skills.find((s) => s.name === 'Fireball')!;
    expect(skillStatLine(fireball)).toBe(
      `Fire Magic · Spell · ${fireball.energy} Energy · ${fireball.activation}s cast · ${fireball.recharge}s recharge · Core`,
    );
  });

  it('shows zero-cost Energy as 0 and a missing attribute plainly', () => {
    const signet = skills.find((s) => s.energy === null && allegianceAttributeName(s) === 'None')!;
    expect(skillStatLine(signet)).toMatch(/^No attribute · .+ · 0 Energy · /);
  });
});
