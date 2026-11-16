// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillLibrary from './SkillLibrary';
import {
  LIBRARY_VIEW_STORAGE_KEY,
  NM_SHOW_NON_ELITE_STORAGE_KEY,
} from '../lib/libraryView';
import { professionName, skills } from '../lib/skills';

const CHECKBOX = 'Show non-elite skills';

const sortByName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const warriorAll = skills
  .filter((skill) => professionName(skill) === 'Warrior')
  .sort(sortByName);
const warriorElites = warriorAll.filter((skill) => skill.elite);
const warriorNonElite = warriorAll.find((skill) => !skill.elite)!;
const monkElites = skills.filter(
  (skill) => professionName(skill) === 'Monk' && skill.elite,
);

async function openLibrary(nmMode: boolean, view?: 'Grid' | 'List') {
  const user = userEvent.setup();
  const result = render(<SkillLibrary nmMode={nmMode} />);
  // The library is open by default.

  if (view) {
    await user.click(screen.getByRole('button', { name: view }));
  }

  return { user, ...result };
}

/** Skill names currently shown, in either view. */
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

function checkbox() {
  return screen.getByRole('checkbox', { name: CHECKBOX });
}

/** A finger tap followed by the browser's synthetic click. */
function touchTap(element: Element) {
  const pointer = { pointerType: 'touch', pointerId: 3, isPrimary: true };
  fireEvent.pointerDown(element, { ...pointer, clientX: 5, clientY: 5 });
  fireEvent.pointerUp(element, pointer);
  fireEvent.click(element, { detail: 1 });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NM library filter', () => {
  it('defaults to elite skills only with no saved preference', async () => {
    await openLibrary(true);

    expect((checkbox() as HTMLInputElement).checked).toBe(false);
    expect(shownNames()).toEqual(warriorElites.map((skill) => skill.name));
    expect(
      screen.getByText(`${warriorElites.length} elite Warrior skills`),
    ).toBeTruthy();
  });

  it.each(['List', 'Grid'] as const)(
    'checking shows non-elites and unchecking hides them (%s view)',
    async (view) => {
      const { user } = await openLibrary(true, view);
      expect(shownNames()).not.toContain(warriorNonElite.name);

      await user.click(checkbox());
      expect(shownNames()).toEqual(warriorAll.map((skill) => skill.name));
      expect(window.localStorage.getItem(NM_SHOW_NON_ELITE_STORAGE_KEY)).toBe(
        'true',
      );

      await user.click(checkbox());
      expect(shownNames()).toEqual(warriorElites.map((skill) => skill.name));
      expect(window.localStorage.getItem(NM_SHOW_NON_ELITE_STORAGE_KEY)).toBe(
        'false',
      );
    },
  );

  it('applies to every profession/PvE filter', async () => {
    const { user } = await openLibrary(true);

    await user.click(screen.getByRole('button', { name: 'Monk' }));
    expect(shownNames()).toHaveLength(monkElites.length);

    await user.click(screen.getByRole('button', { name: 'PvE' }));
    expect(shownNames().sort()).toEqual(
      ['Raven Blessing', 'Ursan Blessing', 'Volfen Blessing'].sort(),
    );
  });

  it('keeps the selected filter and view when toggled', async () => {
    const { user } = await openLibrary(true, 'Grid');
    await user.click(screen.getByRole('button', { name: 'Monk' }));
    await user.click(checkbox());

    expect(screen.getByRole('grid', { name: 'Monk skills' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Monk' }).className).toContain(
      'active',
    );
    expect(window.localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('grid');
  });

  it('restores the preference after remounting', async () => {
    const { user } = await openLibrary(true);
    await user.click(checkbox());
    cleanup();

    await openLibrary(true);
    expect((checkbox() as HTMLInputElement).checked).toBe(true);
    expect(shownNames()).toContain(warriorNonElite.name);
  });

  it('treats an invalid saved value as unchecked', async () => {
    window.localStorage.setItem(NM_SHOW_NON_ELITE_STORAGE_KEY, 'yes please');
    await openLibrary(true);
    expect((checkbox() as HTMLInputElement).checked).toBe(false);
  });

  it('works when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { user } = await openLibrary(true);
    expect(shownNames()).toEqual(warriorElites.map((skill) => skill.name));

    await user.click(checkbox());
    expect(shownNames()).toContain(warriorNonElite.name);
  });

  it('clears open details for a skill that becomes hidden and keeps a Tab stop', async () => {
    window.localStorage.setItem(NM_SHOW_NON_ELITE_STORAGE_KEY, 'true');
    await openLibrary(true, 'Grid');

    const nonEliteLink = within(screen.getByRole('grid')).getByRole('link', {
      name: warriorNonElite.name,
    });
    touchTap(nonEliteLink);
    expect(screen.getByRole('dialog', { name: warriorNonElite.name })).toBeTruthy();

    // A plain click isolates the checkbox change from tap-outside closing.
    fireEvent.click(checkbox());
    expect(screen.queryByRole('dialog')).toBeNull();

    const links = within(screen.getByRole('grid')).getAllByRole('link');
    expect(links.filter((link) => link.tabIndex === 0)).toEqual([links[0]]);
  });
});

describe('HM library', () => {
  it('shows every skill and no checkbox, whatever NM preference is saved', async () => {
    window.localStorage.setItem(NM_SHOW_NON_ELITE_STORAGE_KEY, 'false');
    await openLibrary(false);

    expect(screen.queryByRole('checkbox', { name: CHECKBOX })).toBeNull();
    expect(shownNames()).toEqual(warriorAll.map((skill) => skill.name));
    expect(screen.getByText(`${warriorAll.length} Warrior skills`)).toBeTruthy();
  });

  it('switching to HM and back keeps the NM preference', async () => {
    const { user, rerender } = await openLibrary(true);
    await user.click(checkbox());

    rerender(<SkillLibrary nmMode={false} />);
    expect(screen.queryByRole('checkbox', { name: CHECKBOX })).toBeNull();
    expect(shownNames()).toHaveLength(warriorAll.length);
    expect(window.localStorage.getItem(NM_SHOW_NON_ELITE_STORAGE_KEY)).toBe(
      'true',
    );

    rerender(<SkillLibrary nmMode />);
    expect((checkbox() as HTMLInputElement).checked).toBe(true);
    expect(shownNames()).toContain(warriorNonElite.name);
  });
});
