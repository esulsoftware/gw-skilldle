// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SkillLibrary from './SkillLibrary';
import {
  attributeOptions,
  matchesAttribute,
  matchesType,
  skillStatLine,
  sortSkills,
  tabPool,
  typeOptions,
  LIBRARY_TABS,
} from '../lib/libraryFilters';
import { NM_SHOW_NON_ELITE_STORAGE_KEY } from '../lib/libraryView';
import { skills } from '../lib/skills';

function setup(nmMode = false) {
  const user = userEvent.setup();
  const result = render(<SkillLibrary nmMode={nmMode} />);
  return { user, ...result };
}

const select = (name: string | RegExp) =>
  screen.getByRole('combobox', { name }) as HTMLSelectElement;

function choose(name: string | RegExp, value: string) {
  fireEvent.change(select(name), { target: { value } });
}

function tab(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

/** Names in display order, in either view. */
function shownNames(): string[] {
  const grid = screen.queryByRole('grid');

  if (grid) {
    return within(grid)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')!);
  }

  return [...document.querySelectorAll('.skill-list .library-skill-name')].map(
    (link) => link.textContent!,
  );
}

function countText() {
  return document.querySelector('.library-count')!.textContent;
}

const elementalist = tabPool(skills, 'Elementalist', false);
const fireMagic = elementalist.filter((s) => matchesAttribute(s, 'Fire Magic'));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('open by default', () => {
  it('starts expanded and can be collapsed and reopened with its filters intact', async () => {
    const { user } = setup();
    const toggle = screen.getByRole('button', { name: 'Hide skills' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(shownNames().length).toBeGreaterThan(0);

    tab('Elementalist');
    choose('Attribute', 'Fire Magic');

    await user.click(toggle);
    expect(screen.queryByRole('combobox', { name: 'Attribute' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Browse skills' }));
    expect(select('Attribute').value).toBe('Fire Magic');
    expect(shownNames()).toHaveLength(fireMagic.length);
  });
});

describe('attribute and allegiance filters', () => {
  it('Elementalist + Fire Magic shows only those skills, with an "N of M" count', () => {
    setup();
    tab('Elementalist');
    choose('Attribute', 'Fire Magic');

    expect(shownNames().sort()).toEqual(fireMagic.map((s) => s.name).sort());
    expect(countText()).toBe(
      `${fireMagic.length} of ${elementalist.length} Elementalist skills`,
    );
  });

  it('PvE offers allegiance/rank groups and filters by them', () => {
    setup();
    tab('PvE');
    const rankSelect = select('Allegiance / rank');
    expect(rankSelect.options[0].textContent).toBe('All allegiances/ranks');

    choose('Allegiance / rank', 'Allegiance - Norn');
    const norn = tabPool(skills, 'PvE', false).filter((s) =>
      matchesAttribute(s, 'Allegiance - Norn'),
    );
    expect(shownNames().sort()).toEqual(norn.map((s) => s.name).sort());
  });

  it('offers "No attribute" when a profession has such skills', () => {
    setup();
    tab('Elementalist');
    const labels = [...select('Attribute').options].map((o) => o.textContent);
    expect(labels.some((label) => /^No attribute \(\d+\)$/.test(label!))).toBe(
      true,
    );
  });
});

describe('type filter', () => {
  it('has "All types", family choices, and exact choices in sections', () => {
    setup();
    tab('Monk');
    const typeSelect = select('Type');
    expect(typeSelect.options[0].textContent).toBe('All types');
    const groups = [...typeSelect.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Spells', 'Melee attacks', 'Other types']);

    choose('Type', 'family:spell');
    const monk = tabPool(skills, 'Monk', false);
    expect(shownNames()).toHaveLength(
      monk.filter((s) => matchesType(s, 'family:spell')).length,
    );

    choose('Type', 'type:Spell');
    expect(shownNames()).toHaveLength(
      monk.filter((s) => matchesType(s, 'type:Spell')).length,
    );
  });
});

describe('combined behaviour', () => {
  it('changing tab resets attribute, keeps a still-valid type, and keeps the sort', () => {
    setup();
    tab('Elementalist');
    choose('Attribute', 'Fire Magic');
    choose('Type', 'family:spell');
    choose('Sort by', 'energy');
    choose('Order', 'desc');

    tab('Necromancer');
    expect(select('Attribute').value).toBe('all');
    expect(select('Type').value).toBe('family:spell');
    expect(select('Sort by').value).toBe('energy');
    expect(select('Order').value).toBe('desc');
  });

  it('changing tab resets a type the new tab does not have', () => {
    setup();
    tab('Elementalist');
    choose('Type', 'type:Glyph');
    tab('Monk');
    expect(select('Type').value).toBe('all');
  });

  it('sorting orders both views identically, and changing a filter keeps the sort', async () => {
    const { user } = setup();
    tab('Elementalist');
    choose('Sort by', 'recharge');
    choose('Order', 'desc');
    const expected = sortSkills(elementalist, 'recharge', 'desc').map((s) => s.name);
    expect(shownNames()).toEqual(expected);

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(shownNames()).toEqual(expected);
    expect(select('Sort by').value).toBe('recharge');

    choose('Attribute', 'Fire Magic');
    expect(select('Sort by').value).toBe('recharge');
    expect(shownNames()).toEqual(
      sortSkills(fireMagic, 'recharge', 'desc').map((s) => s.name),
    );

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(select('Attribute').value).toBe('Fire Magic');
    expect(select('Order').value).toBe('desc');
  });

  it('order labels describe the selected field', () => {
    setup();
    const orderLabels = () => [...select('Order').options].map((o) => o.textContent);
    expect(orderLabels()).toEqual(['A–Z', 'Z–A']);
    choose('Sort by', 'energy');
    expect(orderLabels()).toEqual(['Lowest first', 'Highest first']);
    choose('Sort by', 'campaign');
    expect(orderLabels()).toEqual(['Earliest first', 'Latest first']);
    choose('Sort by', 'elite');
    expect(orderLabels()).toEqual(['Elite first', 'Non-elite first']);
  });

  it('reset clears filters and sort but keeps the tab and view', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    tab('Elementalist');
    choose('Attribute', 'Fire Magic');
    choose('Type', 'family:spell');
    choose('Sort by', 'energy');

    await user.click(screen.getByRole('button', { name: 'Reset filters & sort' }));
    expect(select('Attribute').value).toBe('all');
    expect(select('Type').value).toBe('all');
    expect(select('Sort by').value).toBe('name');
    expect(select('Order').value).toBe('asc');
    expect(screen.getByRole('grid', { name: 'Elementalist skills' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Reset filters & sort' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows an empty state with a reset when filters match nothing', async () => {
    // Find an attribute + exact type combination with no skills.
    const attribute = attributeOptions(elementalist)[0].value;
    const emptyType = typeOptions(elementalist)
      .flatMap((section) => section.options)
      .find(
        (option) =>
          !elementalist.some(
            (s) => matchesAttribute(s, attribute) && matchesType(s, option.value),
          ),
      )!;

    const { user } = setup();
    tab('Elementalist');
    choose('Attribute', attribute);
    choose('Type', emptyType.value);

    expect(screen.getByText('No skills match these filters.')).toBeTruthy();
    expect(countText()).toBe(`0 of ${elementalist.length} Elementalist skills`);

    const resets = screen.getAllByRole('button', { name: 'Reset filters & sort' });
    await user.click(resets[resets.length - 1]);
    expect(shownNames()).toHaveLength(elementalist.length);
  });
});

describe('stat lines', () => {
  it('appear in list entries and grid details', async () => {
    const { user } = setup();
    const first = sortSkills(tabPool(skills, 'Warrior', false), 'name', 'asc')[0];
    expect(screen.getByText(skillStatLine(first))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    await user.tab();
    expect(screen.getByTestId('skill-grid-tooltip').textContent).toContain(
      skillStatLine(first),
    );
  });
});

describe('grid after filter/sort changes', () => {
  it('clears open details and keeps keyboard order matching the display', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    const link = within(screen.getByRole('grid')).getAllByRole('link')[2];
    const pointer = { pointerType: 'touch', pointerId: 2 };
    fireEvent.pointerDown(link, { ...pointer, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(link, pointer);
    fireEvent.click(link, { detail: 1 });
    expect(screen.getByRole('dialog')).toBeTruthy();

    choose('Sort by', 'energy');
    expect(screen.queryByRole('dialog')).toBeNull();

    const links = within(screen.getByRole('grid')).getAllByRole('link');
    expect(links.filter((l) => l.tabIndex === 0)).toEqual([links[0]]);

    links[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(links[1]);
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(
      sortSkills(tabPool(skills, 'Warrior', false), 'energy', 'asc').map((s) => s.name),
    );
  });
});

describe('NM interplay', () => {
  it('counts the elite-only pool and hides the Elite sort', () => {
    setup(true);
    tab('Elementalist');
    choose('Attribute', 'Fire Magic');
    const elites = tabPool(skills, 'Elementalist', true);
    const fireElites = elites.filter((s) => matchesAttribute(s, 'Fire Magic'));

    expect(countText()).toBe(
      `${fireElites.length} of ${elites.length} elite Elementalist skills`,
    );
    expect([...select('Sort by').options].map((o) => o.value)).not.toContain('elite');
  });

  it('falls back visibly to Name A–Z when Elite sorting becomes unavailable', () => {
    window.localStorage.setItem(NM_SHOW_NON_ELITE_STORAGE_KEY, 'true');
    setup(true);
    choose('Sort by', 'elite');
    choose('Order', 'desc');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show non-elite skills' }));
    expect(select('Sort by').value).toBe('name');
    expect(select('Order').value).toBe('asc');
  });

  it('resets only a filter that the elite-only pool no longer offers', () => {
    // Find a tab where some attribute exists only among non-elites, plus a
    // type that survives elite-only.
    let found: { tab: string; attribute: string; type: string } | null = null;

    for (const tabName of LIBRARY_TABS) {
      const all = tabPool(skills, tabName, false);
      const elites = tabPool(skills, tabName, true);
      const eliteAttributes = new Set(attributeOptions(elites).map((o) => o.value));
      const lost = attributeOptions(all).find((o) => !eliteAttributes.has(o.value));
      const kept = typeOptions(elites).flatMap((s) => s.options)[0];

      if (lost && kept) {
        found = { tab: tabName, attribute: lost.value, type: kept.value };
        break;
      }
    }

    expect(found).not.toBeNull();
    window.localStorage.setItem(NM_SHOW_NON_ELITE_STORAGE_KEY, 'true');
    setup(true);
    tab(found!.tab);
    const attributeLabel = found!.tab === 'PvE' ? 'Allegiance / rank' : 'Attribute';
    choose(attributeLabel, found!.attribute);
    choose('Type', found!.type);
    choose('Sort by', 'recharge');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show non-elite skills' }));
    expect(select(attributeLabel).value).toBe('all');
    expect(select('Type').value).toBe(found!.type);
    expect(select('Sort by').value).toBe('recharge');
  });

  it('HM switching to NM drops an Elite sort; HM keeps every skill', () => {
    const { rerender } = setup(false);
    choose('Sort by', 'elite');
    rerender(<SkillLibrary nmMode />);
    expect(select('Sort by').value).toBe('name');
    expect(shownNames().length).toBe(tabPool(skills, 'Warrior', true).length);

    rerender(<SkillLibrary nmMode={false} />);
    expect(shownNames().length).toBe(tabPool(skills, 'Warrior', false).length);
  });
});
