// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attributeOptions,
  matchesAttribute,
  matchesType,
  tabPool,
  typeOptions,
} from '../lib/libraryFilters';
import { skills } from '../lib/skills';
import BuildleGame from './BuildleGame';

// Buildle's Skill Library is Skilldle's own SkillLibrary component. These
// tests cover it inside Buildle; its full behaviour is covered by the
// SkillLibrary tests.

const fixture = vi.hoisted(() => {
  const variant = (id: string, skillIds: number[]) => ({
    id,
    skillIds,
    encounter: { campaign: 'Prophecies', locations: ['Fixture Fields'], details: [] },
    sources: [{ site: 'Guild Wars Wiki', url: `https://wiki.example/${id}`, revisionId: 1 }],
    checkedOn: '2026-11-16',
    excludedTargets: [],
    notes: [],
  });

  return {
    catalog: {
      schemaVersion: 3,
      revision: 1,
      description: 'fixture',
      attribution: 'Fixture attribution.',
      bosses: [
        {
          id: 'grawl-fixture',
          name: 'Grawl Fixture',
          // Chilblains, Life Siphon, Plague Signet (elite), Signet of Agony, Troll Unguent
          variants: [variant('grawl-fixture', [144, 109, 132, 145, 446])],
        },
      ],
    },
    schedule: {
      schemaVersion: 1,
      status: 'released',
      description: 'fixture',
      versions: [
        {
          version: 1,
          catalogRevision: 1,
          startsOn: '2026-11-16',
          seed: 'fixture',
          hm: ['grawl-fixture:144'],
          nm: ['grawl-fixture:132'],
        },
      ],
    },
    withdrawals: { description: 'fixture', withdrawals: [] },
  };
});

vi.mock('../data/buildle/catalog-r1.json', () => ({ default: fixture.catalog }));
vi.mock('../data/buildle/schedule.json', () => ({ default: fixture.schedule }));
vi.mock('../data/buildle/withdrawals.json', () => ({ default: fixture.withdrawals }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;

function renderGame() {
  const user = userEvent.setup();
  render(<BuildleGame />);
  return user;
}

const library = () =>
  screen.getByRole('heading', { name: 'Skill Library' }).closest('section') as HTMLElement;
const lib = () => within(library());
const count = () => library().querySelector('.library-count')!.textContent;
const select = (label: string) => lib().getByLabelText(label) as HTMLSelectElement;
const listNames = () =>
  [...library().querySelectorAll('.library-skill-name')].map((a) => a.textContent);
const bar = () => screen.getByRole('list', { name: 'Boss skill bar' });
const slotTexts = () => within(bar()).getAllByRole('listitem').map((li) => li.textContent);
const guessInput = () => document.getElementById('buildle-skill-input') as HTMLInputElement;

async function guess(user: User, name: string) {
  fireEvent.change(guessInput(), { target: { value: name } });
  await user.click(screen.getByRole('button', { name: 'Guess' }));
}

/** Everything a library action must leave untouched. */
function gameState() {
  return {
    slots: slotTexts(),
    input: guessInput().value,
    history: document.querySelector('.buildle-guesses')?.textContent ?? '',
    hint: document.querySelector('.buildle-hint')?.textContent,
    saved: window.localStorage.getItem('gw-buildle-daily-v1:hm:2026-11-16'),
    suggestions: guessInput().getAttribute('aria-controls'),
  };
}

describe('Skill Library in Buildle', () => {
  it('sits below the game and guess history, open by default, and collapses and reopens', async () => {
    const user = renderGame();
    await guess(user, 'Life Siphon');

    const game = document.querySelector('.buildle-game')!;
    const history = document.querySelector('.buildle-guesses')!;
    expect(game.contains(library())).toBe(false);
    expect(history.compareDocumentPosition(library()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(game.compareDocumentPosition(library()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const toggle = lib().getByRole('button', { name: 'Hide skills' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);
    expect(lib().getByRole('button', { name: 'Browse skills' }).getAttribute('aria-expanded')).toBe('false');
    expect(lib().queryByRole('button', { name: 'Monk' })).toBeNull();
    await user.click(lib().getByRole('button', { name: 'Browse skills' }));
    expect(lib().getByRole('button', { name: 'Monk' })).toBeTruthy();
  });

  it('offers tabs, filters, every sort field, List/Grid, and reset', async () => {
    const user = renderGame();

    await user.click(lib().getByRole('button', { name: 'Monk' }));
    expect(count()).toBe(`${tabPool(skills, 'Monk', false).length} Monk skills`);

    fireEvent.change(select('Type'), { target: { value: 'family:spell' } });
    expect(count()).toMatch(/^\d+ of \d+ Monk skills$/);
    fireEvent.change(select('Attribute'), { target: { value: 'Smiting Prayers' } });
    fireEvent.change(select('Sort by'), { target: { value: 'energy' } });
    fireEvent.change(select('Order'), { target: { value: 'desc' } });
    expect([...select('Sort by').options].map((o) => o.value)).toEqual([
      'name', 'energy', 'cast', 'recharge', 'attribute', 'type', 'campaign', 'elite',
    ]);
    expect(library().querySelector('.library-skill-stats')!.textContent).toMatch(/Smiting Prayers · .*Energy/);

    await user.click(lib().getByRole('button', { name: 'Grid' }));
    expect(lib().getByRole('grid')).toBeTruthy();
    await user.click(lib().getByRole('button', { name: 'List' }));

    await user.click(lib().getAllByRole('button', { name: 'Reset filters & sort' })[0]);
    expect(select('Type').value).toBe('all');
    expect(select('Sort by').value).toBe('name');
    expect(count()).toBe(`${tabPool(skills, 'Monk', false).length} Monk skills`);
  });

  it('shows an empty state with reset when filters match nothing', async () => {
    // Find a real attribute + type pair with no Warrior skills.
    const pool = tabPool(skills, 'Warrior', false);
    const [attribute, type] = attributeOptions(pool)
      .flatMap((a) =>
        typeOptions(pool).flatMap((section) => section.options.map((t) => [a.value, t.value])),
      )
      .find(([a, t]) => !pool.some((s) => matchesAttribute(s, a) && matchesType(s, t)))!;

    const user = renderGame();
    fireEvent.change(select('Attribute'), { target: { value: attribute } });
    fireEvent.change(select('Type'), { target: { value: type } });

    expect(listNames()).toEqual([]);
    expect(lib().getByText('No skills match these filters.')).toBeTruthy();
    await user.click(lib().getAllByRole('button', { name: 'Reset filters & sort' })[1]);
    expect(listNames().length).toBe(pool.length);
  });

  it('HM browses the full normal pool, not just the boss’s skills', async () => {
    const user = renderGame();
    await user.click(lib().getByRole('button', { name: 'Necromancer' }));
    expect(count()).toBe(`${tabPool(skills, 'Necromancer', false).length} Necromancer skills`);
    expect(listNames()).toEqual(expect.arrayContaining(['Chilblains', 'Life Siphon', 'Plague Signet']));
    expect(listNames().length).toBeGreaterThan(5);
  });

  it('NM browses elites by default; "Show non-elite skills" never allows non-elite guesses', async () => {
    const user = renderGame();
    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(count()).toBe(`${tabPool(skills, 'Warrior', true).length} elite Warrior skills`);

    await user.click(lib().getByRole('checkbox', { name: 'Show non-elite skills' }));
    expect(count()).toBe(`${tabPool(skills, 'Warrior', false).length} Warrior skills`);

    await guess(user, 'Healing Signet'); // non-elite, now visible in the library
    expect(screen.getByText('Buildle NM only accepts elite skills.')).toBeTruthy();
    expect(document.querySelector('.buildle-guesses')).toBeNull();

    await user.type(guessInput(), 'healing sig');
    const list = document.getElementById('buildle-skill-input-suggestions')!;
    expect(within(list).queryAllByRole('option').map((o) => o.textContent)).not.toContain('Healing Signet');
  });

  it('library actions never change the puzzle, guesses, input, hint, suggestions, or saved progress', async () => {
    const user = renderGame();
    await guess(user, 'Life Siphon');
    fireEvent.change(guessInput(), { target: { value: 'draft' } });
    const before = gameState();

    await user.click(lib().getByRole('button', { name: 'Elementalist' }));
    fireEvent.change(select('Type'), { target: { value: 'family:spell' } });
    fireEvent.change(select('Sort by'), { target: { value: 'recharge' } });
    await user.click(lib().getByRole('button', { name: 'Grid' }));
    await user.click(lib().getByRole('button', { name: 'List' }));
    await user.click(lib().getAllByRole('button', { name: 'Reset filters & sort' })[0]);
    await user.click(lib().getByRole('button', { name: 'Hide skills' }));
    await user.click(lib().getByRole('button', { name: 'Browse skills' }));

    expect(gameState()).toEqual(before);
    await guess(user, 'Chilblains');
    expect(screen.getByText('Solved in 2 guesses.')).toBeTruthy();
  });
});
