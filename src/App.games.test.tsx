// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { skillFor } from './lib/buildle';
import { loadDaily } from './lib/buildleDaily';
import { eliteSkills, skills } from './lib/skills';

const TODAY = new Date('2026-11-16T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const gameButton = (name: 'Skilldle' | 'Buildle') =>
  within(screen.getByRole('group', { name: 'Game' })).getByRole('button', { name });

/** Opens Buildle and waits for its separately loaded chunk. */
async function openBuildle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(gameButton('Buildle'));
  await screen.findByRole('heading', { name: 'Buildle' });
}

/** Today's HM Daily, as Buildle will load it. */
function todaysHmDaily() {
  const round = loadDaily('hm', new Date(), { storage: null });
  if (round.kind !== 'puzzle') throw new Error('expected a Daily puzzle');
  return round.puzzle;
}

const guessInput = () => document.getElementById('skill-input') as HTMLInputElement;
/** Skilldle's own views (Buildle's library has the same labels). */
const skilldleViews = () =>
  [...document.querySelectorAll('.game-view')].filter((view) => !view.querySelector('.buildle-game'));
const skilldleLibrary = () =>
  skilldleViews().find((view) => view.querySelector('.skill-library')) as HTMLElement;
const select = (label: string) =>
  within(skilldleLibrary()).getByLabelText(label) as HTMLSelectElement;

function storageSnapshot() {
  return Object.fromEntries(
    Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]),
  );
}

/** A finger tap on a grid icon (opens its details panel). */
function touchTap(element: Element) {
  const pointer = { pointerType: 'touch', pointerId: 7, isPrimary: true };
  fireEvent.pointerDown(element, { ...pointer, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(element, pointer);
  fireEvent.click(element, { detail: 1 });
}

describe('game switcher', () => {
  it('opens on Skilldle, with Buildle available alongside it', () => {
    render(<App />);

    expect(gameButton('Skilldle').getAttribute('aria-pressed')).toBe('true');
    expect(gameButton('Buildle').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('combobox', { name: 'Your guess' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Buildle' })).toBeNull();
  });

  it('shows Buildle in place of Skilldle, and switches back', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openBuildle(user);

    expect(gameButton('Buildle').getAttribute('aria-pressed')).toBe('true');
    // Skilldle's game is hidden from view and from assistive technology.
    // The only reachable guess box is Buildle's own.
    expect(
      screen.getAllByRole('combobox', { name: 'Your guess' }).map((input) => input.id),
    ).toEqual(['buildle-skill-input']);
    // Only Buildle's own Skill Library is reachable.
    const libraries = screen.getAllByRole('heading', { name: 'Skill Library' });
    expect(libraries).toHaveLength(1);
    expect(skilldleLibrary().contains(libraries[0])).toBe(false);
    // Only Buildle's own selectors are reachable.
    expect(screen.getAllByRole('group', { name: 'Play mode' })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: 'Difficulty' })).toHaveLength(1);
    expect(document.querySelector('.buildle-active-mode')?.textContent).toBe('Daily HM');

    await user.click(gameButton('Skilldle'));

    expect(screen.queryByRole('heading', { name: 'Buildle' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Your guess' })).toBeTruthy();
  });

  it('keeps Skilldle’s round, guesses, typed input, settings, and library state', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // Infinite NM answer: eliteSkills[0]
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'NM' }));
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    fireEvent.change(guessInput(), { target: { value: eliteSkills[1].name } });
    await user.click(screen.getByRole('button', { name: 'Guess' }));
    fireEvent.change(guessInput(), { target: { value: 'Half-typed' } });

    await user.click(screen.getByRole('button', { name: 'Monk' }));
    fireEvent.change(select('Type'), { target: { value: 'family:spell' } });
    fireEvent.change(select('Sort by'), { target: { value: 'energy' } });
    const libraryCount = document.querySelector('.library-count')?.textContent;

    await user.click(gameButton('Buildle'));
    await user.click(gameButton('Skilldle'));

    expect(document.querySelector('.active-mode')?.textContent).toBe('Infinite NM');
    expect(screen.getAllByLabelText(/^Guess \d+$/)).toHaveLength(1);
    const board = screen.getByRole('region', { name: 'Guesses' });
    expect(within(board).getByRole('link', { name: eliteSkills[1].name })).toBeTruthy();
    expect(guessInput().value).toBe('Half-typed');
    expect(screen.getByRole('button', { name: 'Monk' }).className).toContain('active');
    expect(select('Type').value).toBe('family:spell');
    expect(select('Sort by').value).toBe('energy');
    expect(document.querySelector('.library-count')?.textContent).toBe(libraryCount);
  });

  it('switching games never changes Skilldle’s saved progress; Buildle saves only its own keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(guessInput(), { target: { value: eliteSkills[2].name } });
    await user.click(screen.getByRole('button', { name: 'Guess' }));
    const before = storageSnapshot();
    const skilldleOnly = (snapshot: Record<string, string | null>) =>
      Object.fromEntries(Object.entries(snapshot).filter(([key]) => !key.startsWith('gw-buildle-')));

    await openBuildle(user);
    expect(skilldleOnly(storageSnapshot())).toEqual(before);
    expect(Object.keys(storageSnapshot()).filter((key) => key.startsWith('gw-buildle-'))).toEqual([
      'gw-buildle-daily-v1:hm:2026-11-16',
    ]);
    await user.click(gameButton('Skilldle'));
    expect(skilldleOnly(storageSnapshot())).toEqual(before);
  });

  it('the hidden game cannot take keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const skilldleViews = [...container.querySelectorAll('.game-view')];
    const reachesSkilldle = async () => {
      const reached: Element[] = [];
      for (let step = 0; step < 15; step += 1) {
        await user.tab();
        reached.push(document.activeElement!);
      }
      return reached.some((element) =>
        skilldleViews.some((view) => view.contains(element)),
      );
    };

    // Control: while Skilldle is shown, Tab does reach its controls.
    expect(await reachesSkilldle()).toBe(true);

    await user.click(gameButton('Buildle'));
    expect(await reachesSkilldle()).toBe(false);
  });

  it('an open grid popup is removed, so Escape and taps in Buildle do nothing to Skilldle', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Grid' }));

    const link = within(screen.getByRole('grid')).getAllByRole('link')[0];
    touchTap(link);
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Switch by keyboard, so no outside tap closes the panel first.
    gameButton('Buildle').focus();
    await user.keyboard('{Enter}');

    // Skilldle's grid (and its open panel) is gone while Skilldle is hidden.
    expect(skilldleLibrary().querySelector('.skill-grid-panel')).toBeNull();
    expect(skilldleLibrary().querySelector('[role="grid"]')).toBeNull();
    expect(document.querySelector('.skill-grid-panel')).toBeNull();

    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(gameButton('Buildle'));
    expect(window.scrollTo).not.toHaveBeenCalled();

    // Back in Skilldle, the grid returns with the same view, closed.
    await user.click(gameButton('Skilldle'));
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('switching keeps both games’ state', () => {
  const buildleInput = () => document.getElementById('buildle-skill-input') as HTMLInputElement;
  const bar = () => screen.getByRole('list', { name: 'Boss skill bar' });
  const slotTexts = () => within(bar()).getAllByRole('listitem').map((li) => li.textContent);

  it('keeps Buildle’s round, guesses, input, hint count and revealed hint, and Skilldle’s round', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = todaysHmDaily();
    const wrong = skills
      .filter((skill) => !first.variant.skillIds.includes(skill.id))
      .slice(0, 6);

    const user = userEvent.setup();
    render(<App />);

    // Skilldle: one guess and some typed text.
    fireEvent.change(guessInput(), { target: { value: eliteSkills[3].name } });
    await user.click(screen.getByRole('button', { name: 'Guess' }));
    fireEvent.change(guessInput(), { target: { value: 'Skilldle draft' } });

    await openBuildle(user);
    const slots = slotTexts();
    random.mockReturnValue(0.99); // a reroll would now pick another puzzle

    for (const skill of wrong.slice(0, 5)) {
      fireEvent.change(buildleInput(), { target: { value: skill.name } });
      await user.click(screen.getByRole('button', { name: 'Guess' }));
    }
    await user.click(screen.getByRole('button', { name: 'Reveal boss name' }));
    fireEvent.change(buildleInput(), { target: { value: 'Buildle draft' } });

    await user.click(gameButton('Skilldle'));
    expect(guessInput().value).toBe('Skilldle draft');
    expect(screen.getAllByLabelText(/^Guess \d+$/)).toHaveLength(1);
    expect(screen.queryByRole('list', { name: 'Boss skill bar' })).toBeNull();

    await user.click(gameButton('Buildle'));
    expect(slotTexts()).toEqual(slots);
    expect(buildleInput().value).toBe('Buildle draft');
    expect(screen.getByText(first.boss.name)).toBeTruthy();
    const history = screen.getByRole('region', { name: 'Incorrect guesses' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(5);

    // The kept round is still the same puzzle.
    fireEvent.change(buildleInput(), { target: { value: skillFor(first.targetId).name } });
    await user.click(screen.getByRole('button', { name: 'Guess' }));
    expect(screen.getByRole('heading', { name: 'Solved!' })).toBeTruthy();
  });

  it('keeps the hint count (before it is available) across a switch', async () => {
    const first = todaysHmDaily();
    const wrong = skills.filter((skill) => !first.variant.skillIds.includes(skill.id));
    const user = userEvent.setup();
    render(<App />);

    await openBuildle(user);
    for (const skill of wrong.slice(0, 3)) {
      fireEvent.change(buildleInput(), { target: { value: skill.name } });
      await user.click(screen.getByRole('button', { name: 'Guess' }));
    }
    await user.click(gameButton('Skilldle'));
    await user.click(gameButton('Buildle'));

    expect(screen.getByText(/\(3\/5\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reveal boss name' })).toBeNull();
  });

  it('hidden Buildle cannot take focus while Skilldle is shown', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openBuildle(user);
    await user.click(gameButton('Skilldle'));

    const buildle = document.querySelector('.buildle-game')!;
    expect(buildle).toBeTruthy(); // mounted, but hidden
    for (let step = 0; step < 40; step += 1) {
      await user.tab();
      expect(buildle.contains(document.activeElement)).toBe(false);
    }
  });
});

describe('two Skill Libraries (Skilldle and Buildle)', () => {
  const buildleView = () =>
    document.querySelector('.buildle-game')!.closest('.game-view') as HTMLElement;
  const buildleLibrary = () => buildleView().querySelector('.skill-library') as HTMLElement;
  const inLibrary = (library: HTMLElement) => ({
    tab: (name: string) => within(library).getByRole('button', { name }),
    select: (label: string) => within(library).getByLabelText(label) as HTMLSelectElement,
    activeTab: () => library.querySelector('.profession-button.active')?.textContent,
  });

  it('keep independent tabs, filters, and sorting, each preserved across switches', async () => {
    const user = userEvent.setup();
    render(<App />);
    const skilldle = () => inLibrary(skilldleLibrary());
    const buildle = () => inLibrary(buildleLibrary());

    await user.click(skilldle().tab('Monk'));
    fireEvent.change(skilldle().select('Type'), { target: { value: 'family:spell' } });

    await openBuildle(user);
    expect(buildle().activeTab()).toBe('Warrior');
    expect(buildle().select('Type').value).toBe('all');
    await user.click(buildle().tab('Ranger'));
    fireEvent.change(buildle().select('Sort by'), { target: { value: 'energy' } });

    await user.click(gameButton('Skilldle'));
    expect(skilldle().activeTab()).toBe('Monk');
    expect(skilldle().select('Type').value).toBe('family:spell');
    expect(skilldle().select('Sort by').value).toBe('name');

    await user.click(gameButton('Buildle'));
    expect(buildle().activeTab()).toBe('Ranger');
    expect(buildle().select('Sort by').value).toBe('energy');
    expect(buildle().select('Type').value).toBe('all');
  });

  it('give every element a unique ID, with labels and controls inside their own library', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openBuildle(user);
    await user.click(within(buildleLibrary()).getByRole('button', { name: 'Grid' }));

    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const library of [skilldleLibrary().querySelector('.skill-library')!, buildleLibrary()]) {
      const heading = document.getElementById(library.getAttribute('aria-labelledby')!)!;
      expect(heading.textContent).toBe('Skill Library');
      expect(library.contains(heading)).toBe(true);

      const toggle = within(library as HTMLElement).getAllByRole('button', { hidden: true })
        .find((button) => button.hasAttribute('aria-expanded'))!;
      const content = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      expect(library.contains(content)).toBe(true);
    }
  });

  it('the inactive library shows no grid or floating details and cannot take focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(skilldleLibrary()).getByRole('button', { name: 'Grid' }));
    await openBuildle(user);

    // Buildle shown: only its grid exists; Skilldle's is gone.
    expect(skilldleLibrary().querySelector('[role="grid"]')).toBeNull();
    const buildleGrid = within(buildleLibrary()).getByRole('grid');
    fireEvent.pointerOver(within(buildleGrid).getAllByRole('link')[0], { pointerType: 'mouse' });
    expect(screen.getByTestId('skill-grid-tooltip')).toBeTruthy();

    // Back to Skilldle: Buildle's grid and its open tooltip are removed.
    await user.click(gameButton('Skilldle'));
    expect(buildleLibrary().querySelector('[role="grid"]')).toBeNull();
    expect(screen.queryByTestId('skill-grid-tooltip')).toBeNull();
    expect(within(skilldleLibrary()).getByRole('grid')).toBeTruthy();

    for (let step = 0; step < 40; step += 1) {
      await user.tab();
      expect(buildleView().contains(document.activeElement)).toBe(false);
    }
    await user.keyboard('{Escape}');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

describe('pinned guess areas', () => {
  const pinnedForms = () => [...document.querySelectorAll('form.guess-form')];
  const visible = (element: Element) => !element.closest('[hidden]');

  it('only the active game’s pinned guess area is visible and reachable', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(pinnedForms().filter(visible)).toHaveLength(1);

    await openBuildle(user);
    const shown = pinnedForms().filter(visible);
    expect(shown).toHaveLength(1);
    expect(shown[0].querySelector('#buildle-skill-input')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Guess' })).toHaveLength(1);

    await user.click(gameButton('Skilldle'));
    const back = pinnedForms().filter(visible);
    expect(back).toHaveLength(1);
    expect(back[0].querySelector('#skill-input')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Guess' })).toHaveLength(1);
  });

  it('switching games keeps each pinned area’s typed text', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(guessInput(), { target: { value: 'Skilldle draft' } });
    await openBuildle(user);
    const buildleInput = document.getElementById('buildle-skill-input') as HTMLInputElement;
    fireEvent.change(buildleInput, { target: { value: 'Buildle draft' } });

    await user.click(gameButton('Skilldle'));
    expect(guessInput().value).toBe('Skilldle draft');
    await user.click(gameButton('Buildle'));
    expect((document.getElementById('buildle-skill-input') as HTMLInputElement).value).toBe('Buildle draft');
  });
});

describe('give-up scrolling with both games mounted', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('only the active game scrolls to its revealed answer', async () => {
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    } as typeof Element.prototype.scrollIntoView;

    const user = userEvent.setup();
    render(<App />);
    await openBuildle(user);

    // Hidden Skilldle's give-up control is not reachable.
    expect(screen.queryByRole('button', { name: /give me the answer/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Give up / show answer' }));
    expect(scrolled).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Yes, show the answer' }));

    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toBe(screen.getByRole('list', { name: 'Boss skill bar' }));

    // Back in Skilldle: its own give-up scrolls to its own answer only.
    await user.click(gameButton('Skilldle'));
    await user.click(screen.getByRole('button', { name: /give me the answer/ }));
    expect(scrolled).toHaveLength(2);
    expect(scrolled[1].className).toContain('game-over');
    expect(skilldleViews().some((view) => view.contains(scrolled[1]))).toBe(true);
  });
});
