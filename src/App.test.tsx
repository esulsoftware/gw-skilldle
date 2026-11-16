// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { dailyStorageKey } from './lib/modes';
import { dailySkill, eliteSkills, nmDailySkill, skills } from './lib/skills';

const TODAY = new Date('2026-11-16T12:00:00Z');
const HM_KEY = 'gw-skilldle-daily-v3:2026-11-16';
const NM_KEY = 'gw-skilldle-nm-daily-v1:2026-11-16';

const hmAnswer = dailySkill(TODAY);
const nmAnswer = nmDailySkill(TODAY);
const hmWrongGuesses = skills.filter((skill) => skill.id !== hmAnswer.id);
const nmWrongGuesses = eliteSkills.filter((skill) => skill.id !== nmAnswer.id);
const nonElite = skills.find(
  (skill) => !skill.elite && skill.id !== hmAnswer.id,
)!;

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

function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

async function guess(user: ReturnType<typeof userEvent.setup>, name: string) {
  fireEvent.change(screen.getByLabelText('Your guess'), {
    target: { value: name },
  });
  await user.click(screen.getByRole('button', { name: 'Guess' }));
}

/** Opens suggestions on the empty guess input and returns how many are eligible. */
async function suggestionTotal(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByRole('combobox', { name: 'Your guess' });
  await user.click(input);
  await user.keyboard('{ArrowDown}');
  const status = screen.getByRole('status').textContent ?? '';
  const shown = suggestionOptions().map((option) => option.textContent);
  await user.keyboard('{Escape}');
  const total = Number(/of (\d+) matches|^(\d+) matching/.exec(status)?.slice(1).find(Boolean));
  return { total, shown };
}

async function suggestionsFor(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  const input = screen.getByRole('combobox', { name: 'Your guess' });
  fireEvent.change(input, { target: { value: '' } });
  await user.type(input, text);
  const shown = suggestionOptions().map((option) => option.textContent);
  const status = screen.getByRole('status').textContent;
  await user.keyboard('{Escape}');
  fireEvent.change(input, { target: { value: '' } });
  return { shown, status };
}

/** Options in the guess suggestion list only (not the library's menus). */
function suggestionOptions() {
  const input = screen.getByRole('combobox', { name: 'Your guess' });
  const list = document.getElementById(input.getAttribute('aria-controls')!)!;
  return within(list).queryAllByRole('option');
}

function guessRows() {
  return screen.queryAllByLabelText(/^Guess \d+$/);
}

function activeMode() {
  return document.querySelector('.active-mode')?.textContent;
}

function pressed(name: string) {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

function boardColumnCounts() {
  const board = screen.getByRole('region', { name: 'Guesses' });
  return [...board.querySelectorAll('.board-row')].map(
    (row) => row.children.length,
  );
}

describe('startup', () => {
  it('opens on Daily HM', () => {
    renderApp();
    expect(activeMode()).toBe('Daily HM');
    expect(pressed('HM')).toBe('true');
    expect(pressed('NM')).toBe('false');
    expect(pressed('Daily')).toBe('true');
    expect(pressed('Infinite')).toBe('false');
    expect(screen.getByText(/Daily puzzle: 2026-11-16/)).toBeTruthy();
  });

  it('restores HM Daily progress saved before this change', () => {
    window.localStorage.setItem(
      HM_KEY,
      JSON.stringify({
        guessedSkillIds: [hmWrongGuesses[0].id, hmWrongGuesses[1].id],
        gaveUp: false,
      }),
    );

    renderApp();
    expect(guessRows()).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: hmWrongGuesses[1].name }),
    ).toBeTruthy();
  });

  it('still uses the original HM Daily key', () => {
    expect(dailyStorageKey('hm', TODAY)).toBe(HM_KEY);
  });
});

describe('switching modes', () => {
  it('keeps each Daily’s progress separate and preserves the other selector', async () => {
    const user = renderApp();
    await guess(user, hmWrongGuesses[0].name);
    expect(guessRows()).toHaveLength(1);

    // Difficulty switch keeps Daily.
    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(activeMode()).toBe('Daily NM');
    expect(guessRows()).toHaveLength(0);

    await guess(user, nmWrongGuesses[0].name);
    await guess(user, nmWrongGuesses[1].name);
    expect(guessRows()).toHaveLength(2);

    // Play-mode switch keeps NM.
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    expect(activeMode()).toBe('Infinite NM');
    expect(guessRows()).toHaveLength(0);

    // Difficulty switch keeps Infinite.
    await user.click(screen.getByRole('button', { name: 'HM' }));
    expect(activeMode()).toBe('Infinite HM');
    expect(pressed('Infinite')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Daily' }));
    expect(activeMode()).toBe('Daily HM');
    expect(guessRows()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(activeMode()).toBe('Daily NM');
    expect(guessRows()).toHaveLength(2);

    expect(JSON.parse(window.localStorage.getItem(HM_KEY)!)).toEqual({
      guessedSkillIds: [hmWrongGuesses[0].id],
      gaveUp: false,
    });
    expect(JSON.parse(window.localStorage.getItem(NM_KEY)!)).toEqual({
      guessedSkillIds: [nmWrongGuesses[0].id, nmWrongGuesses[1].id],
      gaveUp: false,
    });
  });

  it('starts a new Infinite round after leaving Infinite', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    await guess(user, hmWrongGuesses[0].name);
    expect(guessRows()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Daily' }));
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    expect(guessRows()).toHaveLength(0);
  });

  it('restarting NM Daily leaves HM Daily progress alone', async () => {
    const user = renderApp();
    await guess(user, hmWrongGuesses[0].name);
    await user.click(screen.getByRole('button', { name: 'NM' }));
    await guess(user, nmWrongGuesses[0].name);
    await user.click(screen.getByRole('button', { name: /give me the answer/ }));
    await user.click(
      screen.getByRole('button', { name: 'Restart today’s puzzle' }),
    );

    expect(guessRows()).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(NM_KEY)!).guessedSkillIds)
      .toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(HM_KEY)!).guessedSkillIds)
      .toEqual([hmWrongGuesses[0].id]);
  });
});

describe('NM guesses', () => {
  it('offers only elite skills as suggestions', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'NM' }));

    const { total, shown } = await suggestionTotal(user);
    const eliteNames = new Set(eliteSkills.map((skill) => skill.name));

    expect(total).toBe(eliteSkills.length);
    expect(shown.every((name) => eliteNames.has(name!))).toBe(true);
    expect((await suggestionsFor(user, nonElite.name)).status).toBe(
      'No matching skills',
    );
  });

  it('rejects non-elite and invalid guesses without counting them', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'NM' }));

    await guess(user, nonElite.name);
    expect(screen.getByText('Skilldle NM only accepts elite skills.')).toBeTruthy();
    expect(guessRows()).toHaveLength(0);

    await guess(user, 'Not A Real Skill');
    expect(guessRows()).toHaveLength(0);

    await guess(user, nmWrongGuesses[0].name);
    expect(guessRows()).toHaveLength(1);
    expect(screen.getByLabelText('Guess 1')).toBeTruthy();

    await guess(user, nonElite.name);
    expect(guessRows()).toHaveLength(1);

    await guess(user, nmWrongGuesses[1].name);
    expect(screen.getByLabelText('Guess 2')).toBeTruthy();
  });

  it('still accepts non-elite guesses in HM', async () => {
    const user = renderApp();
    await guess(user, nonElite.name);
    expect(guessRows()).toHaveLength(1);
  });
});

describe('Elite column', () => {
  it('is shown in HM and hidden in NM, with headers and rows aligned', async () => {
    const user = renderApp();
    const board = () => screen.getByRole('region', { name: 'Guesses' });

    await guess(user, hmWrongGuesses[0].name);
    expect(within(board()).getByText('Elite')).toBeTruthy();
    expect(new Set(boardColumnCounts())).toEqual(new Set([9]));

    await user.click(screen.getByRole('button', { name: 'NM' }));
    await guess(user, nmWrongGuesses[0].name);
    expect(within(board()).queryByText('Elite')).toBeNull();
    expect(board().className).toContain('board-nm');
    expect(new Set(boardColumnCounts())).toEqual(new Set([8]));
  });
});

describe('midnight UTC', () => {
  const BEFORE_MIDNIGHT = new Date('2026-11-16T23:59:00Z');
  const AFTER_MIDNIGHT = new Date('2026-11-17T00:01:00Z');
  const keysFor = (prefix: string) => ({
    loaded: `${prefix}:2026-11-16`,
    next: `${prefix}:2026-11-17`,
  });

  it.each([
    ['HM', 'gw-skilldle-daily-v3', hmWrongGuesses],
    ['NM', 'gw-skilldle-nm-daily-v1', nmWrongGuesses],
  ] as const)(
    '%s Daily saves a post-midnight guess under the loaded date only',
    async (difficulty, prefix, wrongGuesses) => {
      vi.setSystemTime(BEFORE_MIDNIGHT);
      const user = renderApp();

      if (difficulty === 'NM') {
        await user.click(screen.getByRole('button', { name: 'NM' }));
      }

      await guess(user, wrongGuesses[0].name);

      vi.setSystemTime(AFTER_MIDNIGHT);
      await guess(user, wrongGuesses[1].name);

      const keys = keysFor(prefix);
      expect(JSON.parse(window.localStorage.getItem(keys.loaded)!)).toEqual({
        guessedSkillIds: [wrongGuesses[0].id, wrongGuesses[1].id],
        gaveUp: false,
      });
      expect(window.localStorage.getItem(keys.next)).toBeNull();

      // The open round keeps showing its own date.
      expect(screen.getByText(/Daily puzzle: 2026-11-16/)).toBeTruthy();
    },
  );

  it('re-entering Daily after midnight loads the new day’s answer and progress', async () => {
    const nextDay = AFTER_MIDNIGHT;
    const nextHmAnswer = dailySkill(nextDay);
    const nextHmGuess = skills.find(
      (skill) => skill.id !== nextHmAnswer.id && skill.id !== hmAnswer.id,
    )!;
    window.localStorage.setItem(
      'gw-skilldle-daily-v3:2026-11-17',
      JSON.stringify({ guessedSkillIds: [nextHmGuess.id], gaveUp: false }),
    );

    vi.setSystemTime(BEFORE_MIDNIGHT);
    const user = renderApp();
    expect(guessRows()).toHaveLength(0);

    vi.setSystemTime(nextDay);
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    await user.click(screen.getByRole('button', { name: 'Daily' }));

    expect(screen.getByText(/Daily puzzle: 2026-11-17/)).toBeTruthy();
    expect(guessRows()).toHaveLength(1);
    expect(screen.getByRole('link', { name: nextHmGuess.name })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /give me the answer/ }));
    expect(document.querySelector('.revealed-answer a')!.textContent).toBe(
      nextHmAnswer.name,
    );

    // NM picks up the new day too.
    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(screen.getByText(/Daily puzzle: 2026-11-17/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /give me the answer/ }));
    expect(document.querySelector('.revealed-answer a')!.textContent).toBe(
      nmDailySkill(nextDay).name,
    );
  });
});

describe('NM Skill Library filter', () => {
  const CHECKBOX = 'Show non-elite skills';
  const PREF_KEY = 'gw-skilldle-library-nm-show-non-elite';
  const library = () =>
    screen.getByRole('region', { name: 'Skill Library' });
  const libraryNames = () =>
    [...library().querySelectorAll('.library-skill-name')].map(
      (link) => link.textContent,
    );
  const warriorNonElite = skills.find(
    (skill) => skill.profession === 1 && !skill.elite,
  )!;

  // The library is open by default; nothing to click.
  async function openLibrary(user: ReturnType<typeof userEvent.setup>) {
    expect(user).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Hide skills' }).getAttribute('aria-expanded'),
    ).toBe('true');
  }

  it('is shared by Daily NM and Infinite NM, hidden in HM, and restored after HM', async () => {
    const user = renderApp();
    await openLibrary(user);

    // HM: no checkbox, full list.
    expect(screen.queryByRole('checkbox', { name: CHECKBOX })).toBeNull();
    expect(libraryNames()).toContain(warriorNonElite.name);

    // Daily NM: elite-only by default.
    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(libraryNames()).not.toContain(warriorNonElite.name);

    await user.click(screen.getByRole('checkbox', { name: CHECKBOX }));
    expect(libraryNames()).toContain(warriorNonElite.name);

    // Infinite NM shares the preference.
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    expect(
      (screen.getByRole('checkbox', { name: CHECKBOX }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(libraryNames()).toContain(warriorNonElite.name);

    // HM hides the checkbox and leaves the saved preference alone.
    await user.click(screen.getByRole('button', { name: 'HM' }));
    expect(screen.queryByRole('checkbox', { name: CHECKBOX })).toBeNull();
    expect(window.localStorage.getItem(PREF_KEY)).toBe('true');

    // Back to NM: the preference is restored.
    await user.click(screen.getByRole('button', { name: 'NM' }));
    expect(
      (screen.getByRole('checkbox', { name: CHECKBOX }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('showing non-elites in the library does not allow non-elite NM guesses', async () => {
    window.localStorage.setItem(PREF_KEY, 'true');
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'NM' }));
    await openLibrary(user);
    expect(libraryNames()).toContain(warriorNonElite.name);

    expect((await suggestionTotal(user)).total).toBe(eliteSkills.length);
    expect((await suggestionsFor(user, warriorNonElite.name)).status).toBe(
      'No matching skills',
    );

    await guess(user, warriorNonElite.name);
    expect(
      screen.getByText('Skilldle NM only accepts elite skills.'),
    ).toBeTruthy();
    expect(guessRows()).toHaveLength(0);
  });
});

describe('guess autocomplete', () => {
  const guessInput = () =>
    screen.getByRole('combobox', { name: 'Your guess' }) as HTMLInputElement;

  it('choosing a suggestion fills the name; a separate Enter submits the guess', async () => {
    const user = renderApp();
    const target = hmWrongGuesses.find((skill) => /^[A-Za-z ]+$/.test(skill.name))!;

    await user.type(guessInput(), target.name.toLowerCase());
    const position = suggestionOptions()
      .findIndex((option) => option.textContent === target.name);
    await user.keyboard('{ArrowDown}'.repeat(position + 1) + '{Enter}');

    expect(guessInput().value).toBe(target.name);
    expect(guessRows()).toHaveLength(0);

    await user.keyboard('{Enter}');
    expect(guessRows()).toHaveLength(1);
    expect(screen.getByRole('link', { name: target.name })).toBeTruthy();
    expect(guessInput().value).toBe('');
    expect(guessInput().getAttribute('aria-expanded')).toBe('false');
  });

  it('removes already-guessed skills from suggestions', async () => {
    const user = renderApp();
    const target = hmWrongGuesses[0];
    const before = await suggestionTotal(user);

    await guess(user, target.name);
    expect(guessRows()).toHaveLength(1);
    expect((await suggestionTotal(user)).total).toBe(before.total - 1);
    expect((await suggestionsFor(user, target.name)).shown).not.toContain(
      target.name,
    );

    // Typing it anyway is still rejected as a duplicate.
    await guess(user, target.name);
    expect(screen.getByText('You already guessed that skill.')).toBeTruthy();
    expect(guessRows()).toHaveLength(1);
  });

  it('HM suggestions use the full eligible pool', async () => {
    const user = renderApp();
    expect((await suggestionTotal(user)).total).toBe(skills.length);
    expect((await suggestionsFor(user, nonElite.name)).shown).toContain(
      nonElite.name,
    );
  });

  it('switching modes closes and resets open suggestions', async () => {
    const user = renderApp();
    await user.type(guessInput(), 'sand');
    await user.keyboard('{ArrowDown}');
    expect(guessInput().getAttribute('aria-expanded')).toBe('true');

    // A plain click, so the input is not blurred first.
    fireEvent.click(screen.getByRole('button', { name: 'NM' }));
    expect(guessInput().value).toBe('');
    expect(guessInput().getAttribute('aria-expanded')).toBe('false');
    expect(guessInput().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('ending the game removes the suggestions', async () => {
    const user = renderApp();
    await user.type(guessInput(), 'sand');
    fireEvent.click(screen.getByRole('button', { name: /give me the answer/ }));

    expect(screen.queryByRole('combobox', { name: 'Your guess' })).toBeNull();
    expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();
  });
});

describe('Skill Library filters and sorting vs gameplay', () => {
  const librarySelect = (name: string) =>
    within(screen.getByRole('region', { name: 'Skill Library' })).getByRole(
      'combobox',
      { name },
    );

  it('the library is open on load without scrolling or taking focus', () => {
    renderApp();
    expect(
      screen.getByRole('button', { name: 'Hide skills' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('library filters and sorting never change suggestions, answers, or saved progress', async () => {
    const user = renderApp();
    await guess(user, hmWrongGuesses[0].name);
    const savedBefore = window.localStorage.getItem(HM_KEY);
    const totalBefore = (await suggestionTotal(user)).total;

    const library = screen.getByRole('region', { name: 'Skill Library' });
    fireEvent.click(within(library).getByRole('button', { name: 'Elementalist' }));
    fireEvent.change(librarySelect('Attribute'), { target: { value: 'Fire Magic' } });
    fireEvent.change(librarySelect('Type'), { target: { value: 'family:spell' } });
    fireEvent.change(librarySelect('Sort by'), { target: { value: 'energy' } });
    fireEvent.change(librarySelect('Order'), { target: { value: 'desc' } });

    expect((await suggestionTotal(user)).total).toBe(totalBefore);
    expect(window.localStorage.getItem(HM_KEY)).toBe(savedBefore);
    expect(guessRows()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /give me the answer/ }));
    expect(document.querySelector('.revealed-answer a')!.textContent).toBe(
      hmAnswer.name,
    );
  });

  it('NM guesses stay elite-only whatever the library shows', async () => {
    window.localStorage.setItem('gw-skilldle-library-nm-show-non-elite', 'true');
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'NM' }));

    fireEvent.change(librarySelect('Sort by'), { target: { value: 'elite' } });
    fireEvent.change(librarySelect('Order'), { target: { value: 'desc' } });

    expect((await suggestionTotal(user)).total).toBe(eliteSkills.length);
    await guess(user, nonElite.name);
    expect(screen.getByText('Skilldle NM only accepts elite skills.')).toBeTruthy();
    expect(guessRows()).toHaveLength(0);
  });
});

describe('Infinite NM', () => {
  it('reveals an elite answer', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'NM' }));
    await user.click(screen.getByRole('button', { name: 'Infinite' }));
    await user.click(screen.getByRole('button', { name: /give me the answer/ }));

    const revealed = document.querySelector('.revealed-answer a')!.textContent;
    expect(eliteSkills.some((skill) => skill.name === revealed)).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Next random elite skill' }),
    ).toBeTruthy();
  });
});
