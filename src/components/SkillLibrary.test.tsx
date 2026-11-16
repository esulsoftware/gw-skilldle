// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillLibrary from './SkillLibrary';
import { LIBRARY_VIEW_STORAGE_KEY } from '../lib/libraryView';
import { wikiUrl } from '../lib/skillLinks';
import { professionName, skills } from '../lib/skills';

function sortedSkillsFor(profession: string) {
  return skills
    .filter((skill) => professionName(skill) === profession)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

const warriorSkills = sortedSkillsFor('Warrior');

async function openLibrary(view?: 'Grid' | 'List') {
  const user = userEvent.setup();
  render(<SkillLibrary />);
  await user.click(screen.getByRole('button', { name: 'Browse skills' }));

  if (view) {
    await user.click(screen.getByRole('button', { name: view }));
  }

  return user;
}

function gridLinks() {
  return within(screen.getByRole('grid')).getAllByRole('link');
}

/** Simulate a finger tap (or drag) followed by the browser's synthetic click. */
function touchTap(element: Element, options: { moveBy?: number } = {}) {
  const pointer = { pointerType: 'touch', pointerId: 7, isPrimary: true };
  fireEvent.pointerDown(element, { ...pointer, clientX: 20, clientY: 20 });

  if (options.moveBy) {
    fireEvent.pointerMove(element, {
      ...pointer,
      clientX: 20,
      clientY: 20 + options.moveBy,
    });
  }

  fireEvent.pointerUp(element, pointer);
  // fireEvent returns false when the click's default action was prevented.
  return fireEvent.click(element, { detail: 1 });
}

/** Returns whether the click reached the document without being prevented. */
function trackNavigation() {
  const clicks: boolean[] = [];
  const listener = (event: MouseEvent) => {
    clicks.push(!event.defaultPrevented);
    event.preventDefault(); // jsdom does not implement navigation.
  };
  document.addEventListener('click', listener);
  return {
    clicks,
    stop: () => document.removeEventListener('click', listener),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('view toggle', () => {
  it('defaults to List when nothing is saved', async () => {
    await openLibrary();
    expect(screen.getByRole('button', { name: 'List' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('preserves the selected filter when switching views', async () => {
    const user = await openLibrary();
    await user.click(screen.getByRole('button', { name: 'Elementalist' }));

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    const grid = screen.getByRole('grid', { name: 'Elementalist skills' });
    expect(within(grid).getByRole('link', { name: 'Sandstorm' })).toBeTruthy();
    expect(screen.getByText(/Elementalist skills$/).textContent).toMatch(
      /^\d+ Elementalist skills$/,
    );

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sandstorm' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Elementalist' }).className,
    ).toContain('active');
  });

  it('saves and restores the view preference', async () => {
    const user = await openLibrary('Grid');
    expect(window.localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('grid');
    cleanup();

    await openLibrary();
    expect(screen.getByRole('grid')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(window.localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY)).toBe('list');
  });

  it('falls back to List for an invalid saved value', async () => {
    window.localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, 'mosaic');
    await openLibrary();
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('works when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const user = await openLibrary();
    expect(screen.queryByRole('grid')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});

describe('grid keyboard navigation', () => {
  it('has one Tab stop, moves with arrows/Home/End, and lets Tab leave', async () => {
    const user = await openLibrary('Grid');
    const links = gridLinks();

    expect(links.filter((link) => link.tabIndex === 0)).toHaveLength(1);

    await user.tab();
    expect(document.activeElement).toBe(links[0]);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(links[1]);

    // jsdom has no layout, so the container falls back to the window width
    // (1024px) and renders 10 columns.
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(links[11]);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(links[19]);

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(links[10]);

    expect(links.filter((link) => link.tabIndex === 0)).toEqual([links[10]]);

    await user.tab();
    expect(screen.getByRole('grid').contains(document.activeElement)).toBe(
      false,
    );

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(links[10]);
  });

  it('follows the rendered column count after a resize', async () => {
    let width = 450;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
      () => width,
    );

    const user = await openLibrary('Grid');
    const rows = within(screen.getByRole('grid')).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('gridcell')).toHaveLength(6);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(gridLinks()[6]);

    width = 300;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    const resizedRows = within(screen.getByRole('grid')).getAllByRole('row');
    expect(within(resizedRows[0]).getAllByRole('gridcell')).toHaveLength(5);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(gridLinks()[11]);
  });

  it('Enter follows the focused skill’s wiki link', async () => {
    const user = await openLibrary('Grid');
    await user.tab();
    await user.keyboard('{ArrowRight}');

    const focused = document.activeElement as HTMLAnchorElement;
    expect(focused.getAttribute('href')).toBe(wikiUrl(warriorSkills[1]));
    expect(focused.getAttribute('target')).toBe('_blank');

    const navigation = trackNavigation();
    await user.keyboard('{Enter}');
    navigation.stop();

    expect(navigation.clicks).toEqual([true]);
  });

  it('a mouse click follows the wiki link', async () => {
    await openLibrary('Grid');
    const navigation = trackNavigation();
    fireEvent.pointerDown(gridLinks()[2], { pointerType: 'mouse' });
    fireEvent.click(gridLinks()[2], { detail: 1 });
    navigation.stop();

    expect(navigation.clicks).toEqual([true]);
  });
});

describe('hover and focus details', () => {
  it('shows name and description on focus; Escape dismisses without reopening', async () => {
    const user = await openLibrary('Grid');
    await user.tab();

    const tooltip = screen.getByTestId('skill-grid-tooltip');
    expect(tooltip.textContent).toContain(warriorSkills[0].name);
    expect(tooltip.textContent).toContain(warriorSkills[0].description);

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();

    // Still closed after any follow-up renders, with focus unchanged.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();
    expect(document.activeElement).toBe(gridLinks()[0]);

    // Moving to another skill shows its details again.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('skill-grid-tooltip').textContent).toContain(
      warriorSkills[1].name,
    );
  });

  it('stays open while the pointer moves onto the popup', async () => {
    await openLibrary('Grid');
    vi.useFakeTimers();
    const link = gridLinks()[0];

    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    const tooltip = screen.getByTestId('skill-grid-tooltip');

    fireEvent.pointerOut(link, { pointerType: 'mouse', relatedTarget: tooltip });
    fireEvent.pointerOver(tooltip, { pointerType: 'mouse', relatedTarget: link });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('skill-grid-tooltip')).toBeTruthy();

    fireEvent.pointerOut(tooltip, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();
  });

  it('describes each icon to assistive technology', async () => {
    await openLibrary('Grid');
    const link = gridLinks()[0];
    const description = document.getElementById(
      link.getAttribute('aria-describedby')!,
    );
    expect(description?.textContent).toContain(warriorSkills[0].description);
  });
});

describe('touch details panel', () => {
  it('first tap opens details without navigating; second tap navigates', async () => {
    await openLibrary('Grid');
    const link = gridLinks()[3];

    expect(touchTap(link)).toBe(false);
    const panel = screen.getByRole('dialog', { name: warriorSkills[3].name });
    expect(panel.textContent).toContain(warriorSkills[3].description);
    expect(document.activeElement).toBe(panel);
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();

    const navigation = trackNavigation();
    touchTap(link);
    navigation.stop();
    expect(navigation.clicks).toEqual([true]);
  });

  it('a scrolling gesture neither opens details nor navigates', async () => {
    await openLibrary('Grid');
    const link = gridLinks()[0];

    expect(touchTap(link, { moveBy: 40 })).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.pointerDown(link, { pointerType: 'touch', pointerId: 8 });
    fireEvent.pointerCancel(link, { pointerType: 'touch', pointerId: 8 });
    expect(fireEvent.click(link, { detail: 1 })).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has a wiki link with the right destination and a close button', async () => {
    const user = await openLibrary('Grid');
    const link = gridLinks()[5];
    touchTap(link);

    const panel = screen.getByRole('dialog');
    const wikiLink = within(panel).getByRole('link', {
      name: /Open on Guild Wars Wiki/,
    });
    expect(wikiLink.getAttribute('href')).toBe(wikiUrl(warriorSkills[5]));
    expect(wikiLink.getAttribute('target')).toBe('_blank');

    await user.click(within(panel).getByRole('button', { name: /Close/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(link);
    // Returning focus does not pop the hover popup back up.
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();
  });

  it('tapping another icon switches; tapping outside closes', async () => {
    await openLibrary('Grid');
    touchTap(gridLinks()[0]);

    expect(touchTap(gridLinks()[1])).toBe(false);
    expect(screen.getByRole('dialog', { name: warriorSkills[1].name })).toBeTruthy();

    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes the panel and returns focus to the icon', async () => {
    const user = await openLibrary('Grid');
    const link = gridLinks()[2];
    touchTap(link);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(link);
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();
  });
});

describe('stale details', () => {
  it('changing the filter clears open details and keeps a keyboard entry point', async () => {
    const user = await openLibrary('Grid');
    touchTap(gridLinks()[4]);
    expect(screen.getByRole('dialog')).toBeTruthy();

    // A plain click (no pointerdown) isolates the filter-change behaviour
    // from the tap-outside handler.
    fireEvent.click(screen.getByRole('button', { name: 'Monk' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();

    const links = gridLinks();
    expect(links.filter((link) => link.tabIndex === 0)).toEqual([links[0]]);

    // Tabbing from the view toggle enters the grid at its first icon.
    screen.getByRole('button', { name: 'Grid' }).focus();
    await user.tab();
    expect(document.activeElement).toBe(links[0]);
  });

  it('a shorter filter list still has a valid Tab stop', async () => {
    const user = await openLibrary('Grid');
    await user.tab();
    await user.keyboard('{End}{ArrowDown}{ArrowDown}{ArrowDown}');

    fireEvent.click(screen.getByRole('button', { name: 'PvE' }));
    const links = gridLinks();
    expect(links.filter((link) => link.tabIndex === 0)).toHaveLength(1);
  });

  it('closing the library clears open details', async () => {
    await openLibrary('Grid');
    touchTap(gridLinks()[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hide skills' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Browse skills' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});
